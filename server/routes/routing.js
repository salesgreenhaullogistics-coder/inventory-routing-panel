const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { getValidInventory } = require('../services/inventoryFilter');
const { scoreWarehouses, incrementWarehouseLoad, getScoreBand } = require('../services/scoringEngine');
const { splitOrder } = require('../services/orderSplitter');

// GET /api/routing/results
router.get('/results', (req, res) => {
  const db = getDb();
  const { orderId, warehouseId, failureReason, isSplit, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];

  if (orderId) { where += ' AND r.order_id = ?'; params.push(parseInt(orderId)); }
  if (warehouseId) { where += ' AND r.assigned_warehouse_id = ?'; params.push(parseInt(warehouseId)); }
  if (failureReason) { where += ' AND r.failure_reason = ?'; params.push(failureReason); }
  if (isSplit !== undefined) { where += ' AND r.is_split = ?'; params.push(isSplit === 'true' ? 1 : 0); }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM routing_results r WHERE ${where}`).get(...params);

  const results = db.prepare(`
    SELECT r.*, w.name as warehouse_name, o.easyecom_order_id, o.reference_code, oi.marketplace_sku, oi.quantity as item_quantity
    FROM routing_results r
    LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
    LEFT JOIN orders o ON o.id = r.order_id
    LEFT JOIN order_items oi ON oi.id = r.order_item_id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  // Enrich results with score interpretation
  const enriched = results.map(r => {
    const band = getScoreBand(r.routing_score);
    return { ...r, score_pct: band.pct, score_band: band.label, score_color: band.color };
  });

  res.json({
    results: enriched,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult.total,
      pages: Math.ceil(countResult.total / parseInt(limit)),
    },
  });
});

// GET /api/routing/splits
router.get('/splits', (req, res) => {
  const db = getDb();
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countResult = db.prepare(`
    SELECT COUNT(DISTINCT r.order_id || '-' || r.order_item_id) as total
    FROM routing_results r WHERE r.is_split = 1
  `).get();

  const splits = db.prepare(`
    SELECT r.order_id, o.easyecom_order_id, o.reference_code, oi.marketplace_sku,
           GROUP_CONCAT(w.name || ':' || r.assigned_quantity, ' | ') as allocations,
           COUNT(*) as split_count,
           SUM(r.assigned_quantity) as total_allocated
    FROM routing_results r
    JOIN orders o ON o.id = r.order_id
    JOIN order_items oi ON oi.id = r.order_item_id
    LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE r.is_split = 1
    GROUP BY r.order_id, r.order_item_id
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  res.json({
    splits,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult.total,
      pages: Math.ceil(countResult.total / parseInt(limit)),
    },
  });
});

// GET /api/routing/attempts/:orderId — Full decision trail
router.get('/attempts/:orderId', (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.orderId);

  const order = db.prepare(`
    SELECT o.id, o.easyecom_order_id, o.reference_code, o.shipping_pincode, o.status
    FROM orders o WHERE o.id = ?
  `).get(orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.id, oi.marketplace_sku, oi.quantity
    FROM order_items oi WHERE oi.order_id = ?
  `).all(orderId);

  const attempts = db.prepare(`
    SELECT a.*, w.name as warehouse_name
    FROM routing_attempts a
    LEFT JOIN warehouses w ON w.id = a.warehouse_id
    WHERE a.order_id = ?
    ORDER BY a.order_item_id, a.attempt_order
  `).all(orderId);

  // Group attempts by order_item_id + enrich with score bands
  const itemAttempts = {};
  for (const a of attempts) {
    const band = getScoreBand(a.routing_score);
    const enriched = { ...a, score_pct: band.pct, score_band: band.label, score_color: band.color };
    if (!itemAttempts[enriched.order_item_id]) itemAttempts[enriched.order_item_id] = [];
    itemAttempts[enriched.order_item_id].push(enriched);
  }

  // Build response grouped by item
  const itemsWithAttempts = items.map(item => ({
    ...item,
    attempts: itemAttempts[item.id] || [],
    totalAttempts: (itemAttempts[item.id] || []).length,
    selectedWarehouse: (itemAttempts[item.id] || []).find(a => a.status === 'selected' || a.status === 'partial'),
  }));

  res.json({ order, items: itemsWithAttempts });
});

// GET /api/routing/attempts/:orderId/:orderItemId — Per-item attempts
router.get('/attempts/:orderId/:orderItemId', (req, res) => {
  const db = getDb();
  const { orderId, orderItemId } = req.params;

  const attempts = db.prepare(`
    SELECT a.*, w.name as warehouse_name
    FROM routing_attempts a
    LEFT JOIN warehouses w ON w.id = a.warehouse_id
    WHERE a.order_id = ? AND a.order_item_id = ?
    ORDER BY a.attempt_order
  `).all(parseInt(orderId), parseInt(orderItemId));

  res.json({ attempts });
});

// GET /api/routing/split-detail/:orderId — Detailed split order breakdown
router.get('/split-detail/:orderId', (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.orderId);

  const order = db.prepare(`
    SELECT o.id, o.easyecom_order_id, o.reference_code, o.shipping_pincode, o.status
    FROM orders o WHERE o.id = ?
  `).get(orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.id, oi.marketplace_sku, oi.quantity
    FROM order_items oi WHERE oi.order_id = ?
  `).all(orderId);

  // Get routing results grouped by item
  const routingResults = db.prepare(`
    SELECT r.*, w.name as warehouse_name
    FROM routing_results r
    LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE r.order_id = ?
    ORDER BY r.order_item_id, r.warehouse_rank
  `).all(orderId);

  // Get current inventory levels at each warehouse for each SKU
  const warehouses = db.prepare('SELECT id, name FROM warehouses ORDER BY priority').all();

  const itemDetails = items.map(item => {
    const itemResults = routingResults.filter(r => r.order_item_id === item.id);
    const warehouseInventory = warehouses.map(wh => {
      const inv = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) as available_qty
        FROM inventory WHERE sku = ? AND warehouse_id = ? AND status = 'Available' AND shelf_life_pct >= 60
      `).get(item.marketplace_sku, wh.id);
      return { warehouseId: wh.id, warehouseName: wh.name, availableQty: inv.available_qty };
    });

    return {
      ...item,
      allocations: itemResults.filter(r => r.assigned_warehouse_id),
      failures: itemResults.filter(r => r.failure_reason),
      warehouseInventory,
    };
  });

  res.json({ order, items: itemDetails });
});

// POST /api/routing/override — Manual routing override
router.post('/override', (req, res) => {
  const db = getDb();
  const { routingResultId, newWarehouseId, newQuantity } = req.body;

  if (!routingResultId || !newWarehouseId) {
    return res.status(400).json({ error: 'routingResultId and newWarehouseId required' });
  }

  const existing = db.prepare(`
    SELECT r.*, oi.marketplace_sku, o.company_name
    FROM routing_results r
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN orders o ON o.id = r.order_id
    WHERE r.id = ?
  `).get(routingResultId);

  if (!existing) return res.status(404).json({ error: 'Routing result not found' });

  // Validate new warehouse has inventory
  const inv = getValidInventory(existing.marketplace_sku, existing.company_name, newWarehouseId);
  if (!inv.available) {
    return res.status(400).json({ error: `No valid inventory at warehouse ${newWarehouseId}: ${inv.reason}` });
  }

  const qty = newQuantity || existing.assigned_quantity;
  if (inv.quantity < qty) {
    return res.status(400).json({ error: `Insufficient inventory: need ${qty}, available ${inv.quantity}` });
  }

  const oldWarehouseId = existing.assigned_warehouse_id;
  const newWh = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(newWarehouseId);

  // Update routing result
  db.prepare(`
    UPDATE routing_results SET assigned_warehouse_id = ?, assigned_quantity = ?, manually_overridden = 1
    WHERE id = ?
  `).run(newWarehouseId, qty, routingResultId);

  // Adjust warehouse loads
  if (oldWarehouseId) {
    db.prepare('UPDATE warehouses SET current_load = MAX(0, current_load - ?) WHERE id = ?').run(existing.assigned_quantity, oldWarehouseId);
  }
  incrementWarehouseLoad(newWarehouseId, qty);

  // Log override as routing attempt
  db.prepare(`
    INSERT INTO routing_attempts (
      order_id, order_item_id, warehouse_id, attempt_order, status, rejection_reason,
      available_qty, required_qty, allocated_qty, distance_km,
      routing_score, distance_score, inventory_score, load_score, speed_score, cost_score, rto_score
    ) VALUES (?, ?, ?, 99, 'manual_override', NULL, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
  `).run(existing.order_id, existing.order_item_id, newWarehouseId, inv.quantity, qty, qty);

  res.json({
    success: true,
    previous: { warehouseId: oldWarehouseId, quantity: existing.assigned_quantity },
    updated: { warehouseId: newWarehouseId, warehouseName: newWh?.name, quantity: qty },
  });
});

// GET /api/routing/optimal-split/:orderId — Suggest alternative split strategies
router.get('/optimal-split/:orderId', (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.orderId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const warehouses = db.prepare('SELECT * FROM warehouses ORDER BY priority').all();

  const strategies = [
    { name: 'Minimize Splits', weights: { DISTANCE: 0.20, INVENTORY: 0.50, LOAD: 0.10, SPEED: 0.10, COST: 0.10 } },
    { name: 'Minimize Cost', weights: { DISTANCE: 0.15, INVENTORY: 0.25, LOAD: 0.10, SPEED: 0.10, COST: 0.40 } },
    { name: 'Fastest Delivery', weights: { DISTANCE: 0.35, INVENTORY: 0.20, LOAD: 0.05, SPEED: 0.35, COST: 0.05 } },
  ];

  const { getDistancesToWarehouses } = require('./distanceCalculator');
  const distances = getDistancesToWarehouses(order.shipping_pincode);
  if (!distances) return res.json({ alternatives: [] });

  const alternatives = strategies.map(strategy => {
    const itemAllocations = [];
    let totalSplits = 0;

    for (const item of items) {
      const candidates = [];
      for (const wh of distances) {
        const inv = getValidInventory(item.marketplace_sku, order.company_name, wh.warehouseId);
        if (inv.available) {
          const meta = warehouses.find(w => w.id === wh.warehouseId) || {};
          candidates.push({
            warehouseId: wh.warehouseId,
            warehouseName: wh.warehouseName || meta.name,
            distanceKm: wh.distanceKm,
            availableQty: inv.quantity,
            priority: meta.priority || 99,
            currentLoad: meta.current_load || 0,
            maxCapacity: meta.max_capacity || 1000,
            avgDeliveryDays: meta.avg_delivery_days || 3,
            baseShippingCost: meta.base_shipping_cost || 50,
          });
        }
      }

      // Use custom weights for scoring
      const { SCORING_WEIGHTS } = require('../utils/constants');
      const origWeights = { ...SCORING_WEIGHTS };
      Object.assign(SCORING_WEIGHTS, strategy.weights);
      const scored = scoreWarehouses(candidates, item.quantity);
      Object.assign(SCORING_WEIGHTS, origWeights); // restore

      const split = splitOrder(item.quantity, scored);
      totalSplits += split.allocations.length;

      itemAllocations.push({
        sku: item.marketplace_sku,
        quantity: item.quantity,
        allocations: split.allocations.map(a => ({
          warehouseId: a.warehouseId,
          warehouseName: a.warehouseName,
          allocatedQty: a.allocatedQty,
          score: a.routingScore,
        })),
        isSplit: split.isSplit,
        unfulfilled: split.unfulfilled,
      });
    }

    // Compute aggregate metrics for this strategy
    let totalDistance = 0, estimatedCost = 0, maxDays = 0, totalRequested = 0, totalFulfilled = 0;
    for (const item of itemAllocations) {
      totalRequested += item.quantity;
      totalFulfilled += item.quantity - item.unfulfilled;
      for (const a of item.allocations) {
        const whMeta = warehouses.find(w => w.id === a.warehouseId);
        totalDistance += (distances.find(d => d.warehouseId === a.warehouseId)?.distanceKm || 0) * a.allocatedQty;
        estimatedCost += (whMeta?.base_shipping_cost || 50);
        maxDays = Math.max(maxDays, whMeta?.avg_delivery_days || 3);
      }
    }
    const fulfillmentRate = totalRequested > 0 ? (totalFulfilled / totalRequested * 100).toFixed(1) : '0.0';

    return {
      strategy: strategy.name,
      totalSplits,
      totalDistance: Math.round(totalDistance),
      estimatedCost: Math.round(estimatedCost),
      estimatedDays: maxDays,
      fulfillmentRate,
      items: itemAllocations,
    };
  });

  res.json({ alternatives });
});

module.exports = router;
