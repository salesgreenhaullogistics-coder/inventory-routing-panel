const { getDb } = require('../db/database');
const { validatePincode } = require('./pincodeValidator');
const { getDistancesToWarehouses } = require('./distanceCalculator');
const { getValidInventory } = require('./inventoryFilter');
const { splitOrder } = require('./orderSplitter');
const { checkHeavyOrder } = require('./heavyOrderDetector');
const { sendSplitOrderAlert } = require('./emailService');
const { scoreWarehouses, incrementWarehouseLoad } = require('./scoringEngine');
const { FAILURE_REASONS } = require('../utils/constants');

async function routeOrder(orderId) {
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  if (items.length === 0) throw new Error(`No items found for order ${orderId}`);

  // Step 1: Validate pincode
  const pincodeResult = validatePincode(order.shipping_pincode, orderId);
  if (!pincodeResult.valid) {
    db.prepare("UPDATE orders SET status = 'failed', processed_at = datetime('now') WHERE id = ?").run(orderId);
    for (const item of items) {
      db.prepare(`
        INSERT INTO routing_results (order_id, order_item_id, assigned_quantity, warehouse_rank, failure_reason)
        VALUES (?, ?, ?, 0, ?)
      `).run(orderId, item.id, item.quantity, pincodeResult.errorType);
    }
    return { success: false, reason: pincodeResult.errorType };
  }

  // Step 2: Calculate distances to all warehouses
  const distances = getDistancesToWarehouses(order.shipping_pincode);
  if (!distances) {
    db.prepare("UPDATE orders SET status = 'failed', processed_at = datetime('now') WHERE id = ?").run(orderId);
    for (const item of items) {
      db.prepare(`
        INSERT INTO routing_results (order_id, order_item_id, assigned_quantity, warehouse_rank, failure_reason)
        VALUES (?, ?, ?, 0, ?)
      `).run(orderId, item.id, item.quantity, FAILURE_REASONS.NO_SERVICEABLE_WAREHOUSE);
    }
    return { success: false, reason: FAILURE_REASONS.NO_SERVICEABLE_WAREHOUSE };
  }

  // Get warehouse metadata for scoring
  const warehouseMeta = db.prepare('SELECT id, priority, avg_delivery_days, base_shipping_cost, current_load, max_capacity FROM warehouses').all();
  const whMetaMap = {};
  for (const wh of warehouseMeta) { whMetaMap[wh.id] = wh; }

  let orderHasSplit = false;
  let allSuccess = true;
  const results = [];

  // Step 3: Route each item using multi-factor scoring
  for (const item of items) {
    const warehouseCandidates = [];
    const failureReasons = [];

    // Gather inventory data for each warehouse
    for (const wh of distances) {
      const inv = getValidInventory(item.marketplace_sku, order.company_name, wh.warehouseId);
      const meta = whMetaMap[wh.warehouseId] || {};

      if (inv.available) {
        warehouseCandidates.push({
          warehouseId: wh.warehouseId,
          warehouseName: wh.warehouseName,
          distanceKm: wh.distanceKm,
          availableQty: inv.quantity,
          priority: meta.priority || 99,
          currentLoad: meta.current_load || 0,
          maxCapacity: meta.max_capacity || 1000,
          avgDeliveryDays: meta.avg_delivery_days || 3,
          baseShippingCost: meta.base_shipping_cost || 50,
        });
      } else {
        failureReasons.push({
          warehouseId: wh.warehouseId,
          reason: inv.reason,
          distanceKm: wh.distanceKm,
        });
      }
    }

    if (warehouseCandidates.length === 0) {
      // Determine failure reason
      let primaryReason = FAILURE_REASONS.NO_INVENTORY;
      if (failureReasons.length > 0) {
        // Check if all reasons are SKU_NOT_FOUND -> that's SKU Missing
        const allSkuMissing = failureReasons.every(f => f.reason === FAILURE_REASONS.SKU_NOT_FOUND);
        if (allSkuMissing) {
          primaryReason = FAILURE_REASONS.SKU_MISSING;
        } else {
          primaryReason = failureReasons[0].reason;
        }
      }

      db.prepare(`
        INSERT INTO routing_results (order_id, order_item_id, assigned_quantity, warehouse_rank, distance_km, failure_reason)
        VALUES (?, ?, ?, 0, ?, ?)
      `).run(orderId, item.id, item.quantity, failureReasons[0]?.distanceKm || 0, primaryReason);
      allSuccess = false;
      results.push({ itemId: item.id, success: false, reason: primaryReason });
      continue;
    }

    // Step 4: Score all candidate warehouses
    const scoredWarehouses = scoreWarehouses(warehouseCandidates, item.quantity);

    // Step 5: Split/allocate using scored order (best score first)
    const splitResult = splitOrder(item.quantity, scoredWarehouses);

    for (const alloc of splitResult.allocations) {
      db.prepare(`
        INSERT INTO routing_results (
          order_id, order_item_id, assigned_warehouse_id, assigned_quantity,
          warehouse_rank, distance_km, routing_score,
          distance_score, inventory_score, load_score, speed_score, cost_score,
          is_split
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId, item.id, alloc.warehouseId, alloc.allocatedQty,
        alloc.rank, alloc.distanceKm, alloc.routingScore || 0,
        alloc.distanceScore || 0, alloc.inventoryScore || 0,
        alloc.loadScore || 0, alloc.speedScore || 0, alloc.costScore || 0,
        splitResult.isSplit ? 1 : 0
      );

      // Update warehouse load
      incrementWarehouseLoad(alloc.warehouseId, alloc.allocatedQty);
    }

    if (splitResult.isSplit) {
      orderHasSplit = true;
    }

    if (splitResult.unfulfilled > 0) {
      db.prepare(`
        INSERT INTO routing_results (order_id, order_item_id, assigned_quantity, warehouse_rank, failure_reason)
        VALUES (?, ?, ?, 0, ?)
      `).run(orderId, item.id, splitResult.unfulfilled, 'Partial - Insufficient Inventory');
      allSuccess = false;
    }

    results.push({
      itemId: item.id,
      success: true,
      allocations: splitResult.allocations,
      isSplit: splitResult.isSplit,
      unfulfilled: splitResult.unfulfilled,
    });

    // Send email if split
    if (splitResult.isSplit) {
      sendSplitOrderAlert(order.easyecom_order_id, splitResult.allocations, item.marketplace_sku)
        .catch(err => console.error('Email alert failed:', err.message));
    }
  }

  // Step 6: Check heavy order
  const heavyResult = checkHeavyOrder(orderId);

  // Determine final order status
  let status = 'routed';
  if (!allSuccess) status = 'failed';
  if (orderHasSplit) status = 'split';
  if (heavyResult.isHeavy) status = 'heavy';

  db.prepare("UPDATE orders SET status = ?, processed_at = datetime('now') WHERE id = ?").run(status, orderId);

  return { success: allSuccess, status, results, isHeavy: heavyResult.isHeavy, hasSplit: orderHasSplit };
}

async function routeAllPending() {
  const db = getDb();
  const { ALLOWED_MARKETPLACES } = require('../utils/constants');
  const placeholders = ALLOWED_MARKETPLACES.map(() => '?').join(',');
  const pendingOrders = db.prepare(
    `SELECT id FROM orders WHERE status = 'pending' AND marketplace IN (${placeholders})`
  ).all(...ALLOWED_MARKETPLACES);

  const results = { total: pendingOrders.length, routed: 0, failed: 0, split: 0, heavy: 0 };

  for (const order of pendingOrders) {
    try {
      const result = await routeOrder(order.id);
      if (result.status === 'routed') results.routed++;
      else if (result.status === 'split') results.split++;
      else if (result.status === 'heavy') results.heavy++;
      else results.failed++;
    } catch (err) {
      console.error(`Failed to route order ${order.id}:`, err.message);
      results.failed++;
    }
  }

  return results;
}

module.exports = { routeOrder, routeAllPending };
