const { getDb } = require('../db/database');
const { validatePincode } = require('./pincodeValidator');
const { getDistancesToWarehouses } = require('./distanceCalculator');
const { getValidInventory } = require('./inventoryFilter');
const { splitOrder } = require('./orderSplitter');
const { checkHeavyOrder } = require('./heavyOrderDetector');
const { sendSplitOrderAlert } = require('./emailService');
const { scoreWarehouses, incrementWarehouseLoad } = require('./scoringEngine');
const { FAILURE_REASONS } = require('../utils/constants');

/**
 * Insert a routing attempt record for decision trail visibility.
 */
function insertAttempt(db, stmt, data) {
  stmt.run(
    data.orderId, data.orderItemId, data.warehouseId, data.attemptOrder,
    data.status, data.rejectionReason || null,
    data.availableQty || 0, data.requiredQty,
    data.allocatedQty || 0, data.distanceKm || 0,
    data.routingScore || 0, data.distanceScore || 0,
    data.inventoryScore || 0, data.loadScore || 0,
    data.speedScore || 0, data.costScore || 0,
    data.rtoScore || 0
  );
}

async function routeOrder(orderId) {
  const db = getDb();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  if (items.length === 0) throw new Error(`No items found for order ${orderId}`);

  // Clear previous routing results and attempts for re-routing
  db.prepare('DELETE FROM routing_results WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM routing_attempts WHERE order_id = ?').run(orderId);

  // Prepare attempt insert statement
  const attemptStmt = db.prepare(`
    INSERT INTO routing_attempts (
      order_id, order_item_id, warehouse_id, attempt_order, status, rejection_reason,
      available_qty, required_qty, allocated_qty, distance_km,
      routing_score, distance_score, inventory_score, load_score, speed_score, cost_score, rto_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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

  // Get RTO rate for shipping pincode
  const rtoData = db.prepare('SELECT rto_rate FROM rto_history WHERE pincode = ?').get(order.shipping_pincode);
  const rtoRate = rtoData?.rto_rate || 0.05; // default 5%

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
          rtoRate: rtoRate,
        });
      } else {
        failureReasons.push({
          warehouseId: wh.warehouseId,
          warehouseName: wh.warehouseName,
          reason: inv.reason,
          distanceKm: wh.distanceKm,
          availableQty: 0,
        });
      }
    }

    if (warehouseCandidates.length === 0) {
      // Record attempts for all rejected warehouses
      let attemptOrder = 1;
      for (const fr of failureReasons) {
        insertAttempt(db, attemptStmt, {
          orderId, orderItemId: item.id, warehouseId: fr.warehouseId,
          attemptOrder: attemptOrder++, status: 'rejected',
          rejectionReason: fr.reason, availableQty: 0,
          requiredQty: item.quantity, distanceKm: fr.distanceKm,
        });
      }

      let primaryReason = FAILURE_REASONS.NO_INVENTORY;
      if (failureReasons.length > 0) {
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

    // Build a map of allocated warehouses for attempt tracking
    const allocMap = {};
    for (const alloc of splitResult.allocations) {
      allocMap[alloc.warehouseId] = alloc;
    }

    // Record attempts for ALL warehouses (both rejected and scored)
    let attemptOrder = 1;

    // First: rejected warehouses (no inventory)
    for (const fr of failureReasons) {
      insertAttempt(db, attemptStmt, {
        orderId, orderItemId: item.id, warehouseId: fr.warehouseId,
        attemptOrder: attemptOrder++, status: 'rejected',
        rejectionReason: fr.reason, availableQty: 0,
        requiredQty: item.quantity, distanceKm: fr.distanceKm,
      });
    }

    // Then: scored warehouses (selected, partial, or outscored)
    for (const sw of scoredWarehouses) {
      const alloc = allocMap[sw.warehouseId];
      let status = 'rejected';
      let rejectionReason = 'Outscored';
      let allocatedQty = 0;

      if (alloc) {
        allocatedQty = alloc.allocatedQty;
        if (allocatedQty >= item.quantity) {
          status = 'selected';
          rejectionReason = null;
        } else if (allocatedQty > 0) {
          status = 'partial';
          rejectionReason = null;
        }
      }

      insertAttempt(db, attemptStmt, {
        orderId, orderItemId: item.id, warehouseId: sw.warehouseId,
        attemptOrder: attemptOrder++, status, rejectionReason,
        availableQty: sw.availableQty, requiredQty: item.quantity,
        allocatedQty, distanceKm: sw.distanceKm,
        routingScore: sw.routingScore, distanceScore: sw.distanceScore,
        inventoryScore: sw.inventoryScore, loadScore: sw.loadScore,
        speedScore: sw.speedScore, costScore: sw.costScore,
        rtoScore: sw.rtoScore || 0,
      });
    }

    // Insert routing results (final assignments)
    for (const alloc of splitResult.allocations) {
      db.prepare(`
        INSERT INTO routing_results (
          order_id, order_item_id, assigned_warehouse_id, assigned_quantity,
          warehouse_rank, distance_km, routing_score,
          distance_score, inventory_score, load_score, speed_score, cost_score, rto_score,
          is_split
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId, item.id, alloc.warehouseId, alloc.allocatedQty,
        alloc.rank, alloc.distanceKm, alloc.routingScore || 0,
        alloc.distanceScore || 0, alloc.inventoryScore || 0,
        alloc.loadScore || 0, alloc.speedScore || 0, alloc.costScore || 0,
        alloc.rtoScore || 0,
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
