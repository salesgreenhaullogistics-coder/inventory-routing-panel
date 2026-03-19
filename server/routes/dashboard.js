const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { getInventoryHealthSummary, getWarehouseHealthSummary, getLowInventoryAlerts, getBadInventory } = require('../services/inventoryHealth');
const { ALLOWED_MARKETPLACES } = require('../utils/constants');

const MP_FILTER = `o.marketplace IN (${ALLOWED_MARKETPLACES.map(() => '?').join(',')})`;
const MP_PARAMS = [...ALLOWED_MARKETPLACES];

function getDateFilters(query) {
  const { dateFrom, dateTo, sku, marketplace, warehouseId } = query;
  let where = '1=1';
  const params = [];

  if (dateFrom) { where += ' AND o.order_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND o.order_date <= ?'; params.push(dateTo); }
  if (sku) {
    where += ' AND r.order_item_id IN (SELECT id FROM order_items WHERE marketplace_sku LIKE ?)';
    params.push(`%${sku}%`);
  }
  if (marketplace) { where += ' AND o.marketplace LIKE ?'; params.push(`%${marketplace}%`); }
  if (warehouseId) { where += ' AND r.assigned_warehouse_id = ?'; params.push(parseInt(warehouseId)); }

  return { where, params };
}

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  const db = getDb();

  const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${MP_FILTER}`).get(...MP_PARAMS).count;
  const routed = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'routed' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const failed = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'failed' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const split = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'split' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const heavy = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'heavy' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const pending = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'pending' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const created = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'created' AND ${MP_FILTER}`).get(...MP_PARAMS).count;

  // Inventory health summary
  const invHealth = getInventoryHealthSummary();

  // Computed percentages
  const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
  const successRate = total > 0 ? (((routed + split) / total) * 100).toFixed(1) : '0.0';

  res.json({
    total, routed, failed, split, heavy, pending, created,
    routedPct: pct(routed), failedPct: pct(failed), splitPct: pct(split),
    heavyPct: pct(heavy), pendingPct: pct(pending), successRate,
    inventoryHealth: {
      healthyUnits: invHealth.healthy_units || 0,
      warningUnits: invHealth.warning_units || 0,
      criticalUnits: invHealth.critical_units || 0,
      healthySkus: invHealth.healthy_skus || 0,
      warningSkus: invHealth.warning_skus || 0,
      criticalSkus: invHealth.critical_skus || 0,
      totalUnits: invHealth.total_units || 0,
    },
  });
});

// GET /api/dashboard/orders-by-status
router.get('/orders-by-status', (req, res) => {
  const db = getDb();
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  if (!status) return res.status(400).json({ error: 'Status is required' });

  let where = MP_FILTER;
  const params = [...MP_PARAMS];
  if (status !== 'total') {
    where += ' AND o.status = ?';
    params.push(status);
  }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM orders o WHERE ${where}`).get(...params);

  const orders = db.prepare(`
    SELECT o.id, o.reference_code, o.easyecom_order_id, o.order_date,
           o.shipping_pincode, o.marketplace, o.customer_name, o.status,
           o.total_weight_kg,
           GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus,
           (SELECT w.name FROM routing_results r
            JOIN warehouses w ON w.id = r.assigned_warehouse_id
            WHERE r.order_id = o.id AND r.failure_reason IS NULL LIMIT 1) as assigned_warehouse,
           (SELECT GROUP_CONCAT(DISTINCT r.failure_reason)
            FROM routing_results r WHERE r.order_id = o.id AND r.failure_reason IS NOT NULL) as failure_reasons
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE ${where}
    GROUP BY o.id
    ORDER BY o.order_date DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult.total,
      pages: Math.ceil(countResult.total / parseInt(limit)),
    },
  });
});

// GET /api/dashboard/inventory-health
router.get('/inventory-health', (req, res) => {
  const summary = getInventoryHealthSummary();
  const warehouseHealth = getWarehouseHealthSummary();
  const alerts = getLowInventoryAlerts();

  res.json({ summary, warehouseHealth, alerts });
});

// GET /api/dashboard/warehouse-alerts
router.get('/warehouse-alerts', (req, res) => {
  const alerts = getLowInventoryAlerts();
  const warehouseHealth = getWarehouseHealthSummary();

  // Generate alert messages
  const alertMessages = [];
  for (const wh of warehouseHealth) {
    if (wh.load_pct >= 90) {
      alertMessages.push({ type: 'critical', warehouse: wh.warehouse_name, message: `Warehouse at ${wh.load_pct}% capacity` });
    } else if (wh.load_pct >= 70) {
      alertMessages.push({ type: 'warning', warehouse: wh.warehouse_name, message: `Warehouse at ${wh.load_pct}% capacity` });
    }
    if (wh.out_of_stock_skus > 0) {
      alertMessages.push({ type: 'critical', warehouse: wh.warehouse_name, message: `${wh.out_of_stock_skus} SKUs out of stock` });
    }
    if (wh.critical_units > 0) {
      alertMessages.push({ type: 'warning', warehouse: wh.warehouse_name, message: `${wh.critical_units} units with critical shelf life` });
    }
  }

  res.json({ alerts, warehouseHealth, alertMessages });
});

// GET /api/dashboard/routing-distribution
router.get('/routing-distribution', (req, res) => {
  const db = getDb();
  const { where, params } = getDateFilters(req.query);

  const distribution = db.prepare(`
    SELECT r.warehouse_rank, COUNT(*) as count,
           ROUND(AVG(r.routing_score), 4) as avg_score
    FROM routing_results r
    JOIN orders o ON o.id = r.order_id
    WHERE r.failure_reason IS NULL AND r.warehouse_rank > 0 AND ${where}
    GROUP BY r.warehouse_rank
    ORDER BY r.warehouse_rank
  `).all(...params);

  const totalRouted = distribution.reduce((sum, d) => sum + d.count, 0);
  const result = distribution.map(d => ({
    rank: d.warehouse_rank,
    label: d.warehouse_rank === 1 ? 'Best Score' :
           d.warehouse_rank === 2 ? '2nd Best' :
           d.warehouse_rank === 3 ? '3rd Best' : '4th Best',
    count: d.count,
    avgScore: d.avg_score,
    percentage: totalRouted > 0 ? ((d.count / totalRouted) * 100).toFixed(1) : 0,
  }));

  res.json({ distribution: result, totalRouted });
});

// GET /api/dashboard/scoring-breakdown
router.get('/scoring-breakdown', (req, res) => {
  const db = getDb();

  // Average scores per warehouse
  const breakdown = db.prepare(`
    SELECT
      w.name as warehouse_name,
      COUNT(*) as order_count,
      ROUND(AVG(r.routing_score), 4) as avg_routing_score,
      ROUND(AVG(r.distance_score), 4) as avg_distance_score,
      ROUND(AVG(r.inventory_score), 4) as avg_inventory_score,
      ROUND(AVG(r.load_score), 4) as avg_load_score,
      ROUND(AVG(r.speed_score), 4) as avg_speed_score,
      ROUND(AVG(r.cost_score), 4) as avg_cost_score,
      ROUND(AVG(r.rto_score), 4) as avg_rto_score
    FROM routing_results r
    JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE r.failure_reason IS NULL
    GROUP BY r.assigned_warehouse_id
    ORDER BY avg_routing_score DESC
  `).all();

  res.json({ breakdown });
});

// GET /api/dashboard/failure-reasons
router.get('/failure-reasons', (req, res) => {
  const db = getDb();
  const { where, params } = getDateFilters(req.query);

  const reasons = db.prepare(`
    SELECT r.failure_reason, COUNT(*) as count
    FROM routing_results r
    JOIN orders o ON o.id = r.order_id
    WHERE r.failure_reason IS NOT NULL AND ${where}
    GROUP BY r.failure_reason
    ORDER BY count DESC
  `).all(...params);

  const { drillDown } = req.query;
  let details = [];
  if (drillDown) {
    details = db.prepare(`
      SELECT r.*, o.easyecom_order_id, o.reference_code, o.order_date, o.shipping_pincode,
             oi.marketplace_sku, oi.quantity as item_quantity,
             w.name as warehouse_name
      FROM routing_results r
      JOIN orders o ON o.id = r.order_id
      JOIN order_items oi ON oi.id = r.order_item_id
      LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
      WHERE r.failure_reason = ?
      ORDER BY o.order_date DESC
      LIMIT 100
    `).all(drillDown);
  }

  res.json({ reasons, details });
});

// GET /api/dashboard/warehouse-utilization
router.get('/warehouse-utilization', (req, res) => {
  const db = getDb();

  const utilization = db.prepare(`
    SELECT w.id, w.name, w.priority, w.current_load, w.max_capacity,
           ROUND(CAST(w.current_load AS REAL) / NULLIF(w.max_capacity, 0) * 100, 1) as load_pct,
           w.avg_delivery_days, w.base_shipping_cost,
           COUNT(DISTINCT r.order_id) as order_count,
           COALESCE(SUM(r.assigned_quantity), 0) as total_units,
           ROUND(AVG(r.routing_score), 4) as avg_routing_score,
           COALESCE(inv.total_inventory, 0) as available_inventory
    FROM warehouses w
    LEFT JOIN routing_results r ON r.assigned_warehouse_id = w.id AND r.failure_reason IS NULL
    LEFT JOIN (
      SELECT warehouse_id, SUM(quantity) as total_inventory
      FROM inventory WHERE status = 'Available' AND shelf_life_pct >= 60
      GROUP BY warehouse_id
    ) inv ON inv.warehouse_id = w.id
    GROUP BY w.id
    ORDER BY w.priority
  `).all();

  res.json({ utilization });
});

// GET /api/dashboard/shelf-life
router.get('/shelf-life', (req, res) => {
  const db = getDb();

  const buckets = db.prepare(`
    SELECT
      CASE
        WHEN shelf_life_pct < 30 THEN 'Critical (<30%)'
        WHEN shelf_life_pct < 60 THEN 'Warning (30-60%)'
        WHEN shelf_life_pct < 80 THEN 'Healthy (60-80%)'
        ELSE 'Excellent (80-100%)'
      END as bucket,
      CASE
        WHEN shelf_life_pct < 30 THEN 'critical'
        WHEN shelf_life_pct < 60 THEN 'warning'
        WHEN shelf_life_pct < 80 THEN 'healthy'
        ELSE 'excellent'
      END as level,
      COUNT(*) as count,
      SUM(quantity) as total_qty
    FROM inventory
    GROUP BY bucket
    ORDER BY MIN(shelf_life_pct)
  `).all();

  res.json({ buckets });
});

// GET /api/dashboard/split-stats
router.get('/split-stats', (req, res) => {
  const db = getDb();

  const totalOrders = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status != 'pending' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const splitOrders = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'split' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const nonSplitRouted = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'routed' AND ${MP_FILTER}`).get(...MP_PARAMS).count;

  const avgSplits = db.prepare(`
    SELECT AVG(split_count) as avg_splits FROM (
      SELECT order_id, COUNT(*) as split_count
      FROM routing_results WHERE is_split = 1 AND failure_reason IS NULL
      GROUP BY order_id
    )
  `).get();

  res.json({
    totalProcessed: totalOrders,
    splitOrders,
    nonSplitRouted,
    avgSplitsPerOrder: avgSplits?.avg_splits?.toFixed(1) || 0,
  });
});

// GET /api/dashboard/daily-trends
router.get('/daily-trends', (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo } = req.query;

  let where = `marketplace IN (${ALLOWED_MARKETPLACES.map(() => '?').join(',')})`;
  const params = [...MP_PARAMS];
  if (dateFrom) { where += ' AND order_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND order_date <= ?'; params.push(dateTo); }

  const trends = db.prepare(`
    SELECT DATE(order_date) as date,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'routed' THEN 1 ELSE 0 END) as routed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status = 'split' THEN 1 ELSE 0 END) as split
    FROM orders
    WHERE ${where}
    GROUP BY DATE(order_date)
    ORDER BY date DESC
    LIMIT 30
  `).all(...params);

  res.json({ trends: trends.reverse() });
});

// GET /api/dashboard/misroute-rate — Ideal vs actual warehouse assignment (uses routing_attempts for true nearest)
router.get('/misroute-rate', (req, res) => {
  const db = getDb();
  const MP = ALLOWED_MARKETPLACES;
  const mpPlaceholders = MP.map(() => '?').join(',');

  // Use routing_attempts table: attempt_order=1 is always the NEAREST warehouse (true ideal).
  // If attempt_order=1 was rejected, the order was mis-routed to a fallback.

  // Overall summary from attempts
  const overall = db.prepare(`
    SELECT
      COUNT(DISTINCT a.order_id) as total_orders_evaluated,
      COUNT(DISTINCT CASE WHEN a.attempt_order = 1 AND a.status IN ('selected','partial') THEN a.order_id END) as ideal_routed,
      COUNT(DISTINCT CASE WHEN a.attempt_order = 1 AND a.status = 'rejected' THEN a.order_id END) as ideal_rejected,
      COUNT(DISTINCT CASE WHEN a.attempt_order > 1 AND a.status IN ('selected','partial') THEN a.order_id END) as fallback_routed
    FROM routing_attempts a
    JOIN orders o ON o.id = a.order_id
    WHERE o.marketplace IN (${mpPlaceholders})
  `).get(...MP);

  // Orders that couldn't be routed at all (all 4 rejected)
  const totalFailed = db.prepare(`
    SELECT COUNT(*) as count FROM orders o WHERE o.status = 'failed' AND o.marketplace IN (${mpPlaceholders})
  `).get(...MP).count;

  // Also include orders routed via routing_results (those without attempts data — older orders)
  const routedWithoutAttempts = db.prepare(`
    SELECT
      COUNT(DISTINCT r.order_id) as count
    FROM routing_results r
    JOIN orders o ON o.id = r.order_id
    WHERE r.failure_reason IS NULL AND r.assigned_warehouse_id IS NOT NULL
      AND o.marketplace IN (${mpPlaceholders})
      AND r.order_id NOT IN (SELECT DISTINCT order_id FROM routing_attempts)
  `).get(...MP).count;

  // Per-warehouse: should have received (nearest) vs actually received vs missed
  const byWarehouse = db.prepare(`
    SELECT
      w.name as warehouse_name,
      w.id as warehouse_id,
      -- Should have received: this warehouse was the nearest (attempt_order=1)
      COUNT(DISTINCT CASE WHEN a.attempt_order = 1 THEN a.order_id END) as should_have_received,
      -- Actually received: this warehouse was selected (any rank)
      COUNT(DISTINCT CASE WHEN a.status IN ('selected','partial') THEN a.order_id END) as actually_received,
      -- Missed: this was nearest but rejected (inventory issue forced fallback)
      COUNT(DISTINCT CASE WHEN a.attempt_order = 1 AND a.status = 'rejected' THEN a.order_id END) as missed_due_to_inventory,
      -- Gained: this was NOT nearest but received the order (fallback from elsewhere)
      COUNT(DISTINCT CASE WHEN a.attempt_order > 1 AND a.status IN ('selected','partial') THEN a.order_id END) as gained_from_fallback,
      -- Top rejection reason at this warehouse
      (SELECT a2.rejection_reason FROM routing_attempts a2
       WHERE a2.warehouse_id = w.id AND a2.status = 'rejected' AND a2.rejection_reason IS NOT NULL
       GROUP BY a2.rejection_reason ORDER BY COUNT(*) DESC LIMIT 1) as top_rejection_reason,
      -- Count of rejections
      COUNT(CASE WHEN a.status = 'rejected' AND a.rejection_reason != 'Outscored' THEN 1 END) as rejection_count
    FROM warehouses w
    LEFT JOIN routing_attempts a ON a.warehouse_id = w.id
    LEFT JOIN orders o ON o.id = a.order_id AND o.marketplace IN (${mpPlaceholders})
    GROUP BY w.id
    ORDER BY w.priority
  `).all(...MP);

  // Detailed rejection reasons across all warehouses
  const rejectionBreakdown = db.prepare(`
    SELECT
      a.rejection_reason as reason,
      COUNT(DISTINCT a.order_id) as unique_orders,
      COUNT(*) as total_rejections,
      GROUP_CONCAT(DISTINCT w.name) as warehouses_affected
    FROM routing_attempts a
    JOIN orders o ON o.id = a.order_id
    JOIN warehouses w ON w.id = a.warehouse_id
    WHERE a.status = 'rejected' AND a.rejection_reason IS NOT NULL AND a.rejection_reason != 'Outscored'
      AND o.marketplace IN (${mpPlaceholders})
    GROUP BY a.rejection_reason
    ORDER BY total_rejections DESC
  `).all(...MP);

  // Compute percentages
  const totalProcessed = (overall.ideal_routed || 0) + (overall.fallback_routed || 0) + totalFailed + routedWithoutAttempts;
  const idealPct = totalProcessed > 0 ? ((overall.ideal_routed / totalProcessed) * 100).toFixed(1) : '0.0';
  const fallbackPct = totalProcessed > 0 ? ((overall.fallback_routed / totalProcessed) * 100).toFixed(1) : '0.0';
  const failedPct = totalProcessed > 0 ? ((totalFailed / totalProcessed) * 100).toFixed(1) : '0.0';
  const misrouteRate = totalProcessed > 0
    ? (((overall.fallback_routed + totalFailed) / totalProcessed) * 100).toFixed(1) : '0.0';

  res.json({
    summary: {
      totalProcessed,
      idealRouted: overall.ideal_routed || 0,
      idealPct,
      fallbackRouted: overall.fallback_routed || 0,
      fallbackPct,
      failedNoInventory: totalFailed,
      failedPct,
      routedWithoutAttempts,
      misrouteRate,
    },
    byWarehouse,
    rejectionBreakdown,
  });
});

// GET /api/dashboard/misroute-drilldown — Clickable drilldown for mis-route numbers
router.get('/misroute-drilldown', (req, res) => {
  const db = getDb();
  const { type, warehouseId, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const MP = ALLOWED_MARKETPLACES;
  const mpPlaceholders = MP.map(() => '?').join(',');

  let query, countQuery, params;

  if (type === 'ideal') {
    // Orders routed to their ideal (nearest) warehouse
    query = `
      SELECT DISTINCT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             w.name as warehouse_name, a.distance_km, a.routing_score,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
      FROM routing_attempts a
      JOIN orders o ON o.id = a.order_id
      JOIN warehouses w ON w.id = a.warehouse_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.attempt_order = 1 AND a.status IN ('selected','partial') AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(DISTINCT a.order_id) as total FROM routing_attempts a JOIN orders o ON o.id = a.order_id WHERE a.attempt_order = 1 AND a.status IN ('selected','partial') AND o.marketplace IN (${mpPlaceholders})`;
    params = [...MP];
  } else if (type === 'fallback') {
    // Orders routed to a non-ideal (fallback) warehouse
    query = `
      SELECT DISTINCT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             w.name as warehouse_name, a.distance_km, a.routing_score, a.attempt_order as fallback_rank,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
      FROM routing_attempts a
      JOIN orders o ON o.id = a.order_id
      JOIN warehouses w ON w.id = a.warehouse_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.attempt_order > 1 AND a.status IN ('selected','partial') AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(DISTINCT a.order_id) as total FROM routing_attempts a JOIN orders o ON o.id = a.order_id WHERE a.attempt_order > 1 AND a.status IN ('selected','partial') AND o.marketplace IN (${mpPlaceholders})`;
    params = [...MP];
  } else if (type === 'failed') {
    // Orders that failed (no inventory at any warehouse)
    query = `
      SELECT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus,
             GROUP_CONCAT(DISTINCT r.failure_reason) as failure_reasons
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN routing_results r ON r.order_id = o.id AND r.failure_reason IS NOT NULL
      WHERE o.status = 'failed' AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(*) as total FROM orders o WHERE o.status = 'failed' AND o.marketplace IN (${mpPlaceholders})`;
    params = [...MP];
  } else if (type === 'warehouse_should' && warehouseId) {
    // Orders where this warehouse was the nearest (attempt_order=1)
    query = `
      SELECT DISTINCT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             a.status as attempt_status, a.rejection_reason, a.distance_km, a.available_qty, a.required_qty,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
      FROM routing_attempts a
      JOIN orders o ON o.id = a.order_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.attempt_order = 1 AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(DISTINCT a.order_id) as total FROM routing_attempts a JOIN orders o ON o.id = a.order_id WHERE a.attempt_order = 1 AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})`;
    params = [parseInt(warehouseId), ...MP];
  } else if (type === 'warehouse_actual' && warehouseId) {
    // Orders actually fulfilled by this warehouse
    query = `
      SELECT DISTINCT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             a.attempt_order as rank_used, a.distance_km, a.routing_score, a.allocated_qty,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
      FROM routing_attempts a
      JOIN orders o ON o.id = a.order_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.status IN ('selected','partial') AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(DISTINCT a.order_id) as total FROM routing_attempts a JOIN orders o ON o.id = a.order_id WHERE a.status IN ('selected','partial') AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})`;
    params = [parseInt(warehouseId), ...MP];
  } else if (type === 'warehouse_missed' && warehouseId) {
    // Orders where this warehouse was nearest but rejected
    query = `
      SELECT DISTINCT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
             a.rejection_reason, a.distance_km, a.available_qty, a.required_qty,
             GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
      FROM routing_attempts a
      JOIN orders o ON o.id = a.order_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.attempt_order = 1 AND a.status = 'rejected' AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})
      GROUP BY o.id ORDER BY o.order_date DESC LIMIT ? OFFSET ?`;
    countQuery = `SELECT COUNT(DISTINCT a.order_id) as total FROM routing_attempts a JOIN orders o ON o.id = a.order_id WHERE a.attempt_order = 1 AND a.status = 'rejected' AND a.warehouse_id = ? AND o.marketplace IN (${mpPlaceholders})`;
    params = [parseInt(warehouseId), ...MP];
  } else {
    return res.status(400).json({ error: 'Invalid type. Use: ideal, fallback, failed, warehouse_should, warehouse_actual, warehouse_missed' });
  }

  const total = db.prepare(countQuery).get(...params).total;
  const orders = db.prepare(query).all(...params, parseInt(limit), offset);

  res.json({
    orders,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
  });
});

// GET /api/dashboard/bad-inventory
router.get('/bad-inventory', (req, res) => {
  const badInventory = getBadInventory();
  res.json(badInventory);
});

// GET /api/dashboard/attempt-stats — Routing attempt analytics
router.get('/attempt-stats', (req, res) => {
  const db = getDb();

  const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM routing_attempts').get().count;
  const totalOrders = db.prepare('SELECT COUNT(DISTINCT order_id) as count FROM routing_attempts').get().count;

  const avgAttemptsPerItem = db.prepare(`
    SELECT ROUND(AVG(cnt), 1) as avg FROM (
      SELECT COUNT(*) as cnt FROM routing_attempts GROUP BY order_id, order_item_id
    )
  `).get();

  const rejectionReasons = db.prepare(`
    SELECT rejection_reason, COUNT(*) as count
    FROM routing_attempts WHERE status = 'rejected' AND rejection_reason IS NOT NULL AND rejection_reason != 'Outscored'
    GROUP BY rejection_reason ORDER BY count DESC
  `).all();

  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count FROM routing_attempts GROUP BY status ORDER BY count DESC
  `).all();

  const warehouseSelectionRate = db.prepare(`
    SELECT w.name as warehouse_name,
           SUM(CASE WHEN a.status IN ('selected', 'partial') THEN 1 ELSE 0 END) as selected_count,
           COUNT(*) as total_evaluations,
           ROUND(CAST(SUM(CASE WHEN a.status IN ('selected', 'partial') THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 1) as selection_rate
    FROM routing_attempts a
    JOIN warehouses w ON w.id = a.warehouse_id
    GROUP BY a.warehouse_id ORDER BY selection_rate DESC
  `).all();

  res.json({
    totalAttempts,
    totalOrders,
    avgAttemptsPerItem: avgAttemptsPerItem?.avg || 0,
    rejectionReasons,
    statusBreakdown,
    warehouseSelectionRate,
  });
});

// GET /api/dashboard/ai-insights — Rule-based AI analytics and recommendations
router.get('/ai-insights', (req, res) => {
  const db = getDb();
  const insights = [];

  // 1. Fulfillment Rate
  const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${MP_FILTER}`).get(...MP_PARAMS).count;
  const routed = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status IN ('routed','split') AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  const fulfillRate = total > 0 ? (routed / total * 100) : 0;
  if (total > 0 && fulfillRate < 80) {
    insights.push({
      type: fulfillRate < 50 ? 'critical' : 'warning',
      title: 'Low Fulfillment Rate',
      description: `Only ${fulfillRate.toFixed(1)}% of orders are being successfully routed. ${total - routed} orders remain unassigned.`,
      metric: `${fulfillRate.toFixed(1)}%`,
      recommendation: 'Review inventory levels and pincode coverage to improve routing success.',
    });
  } else if (total > 0) {
    insights.push({
      type: 'info',
      title: 'Healthy Fulfillment Rate',
      description: `${fulfillRate.toFixed(1)}% of orders are successfully routed or split.`,
      metric: `${fulfillRate.toFixed(1)}%`,
      recommendation: 'Maintain current inventory levels to sustain high fulfillment.',
    });
  }

  // 2. Warehouse Imbalance
  const whDist = db.prepare(`
    SELECT w.name, COUNT(*) as cnt FROM routing_results r
    JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE r.failure_reason IS NULL GROUP BY r.assigned_warehouse_id ORDER BY cnt DESC
  `).all();
  const totalRouted = whDist.reduce((s, w) => s + w.cnt, 0);
  if (whDist.length > 0 && totalRouted > 0) {
    const topPct = (whDist[0].cnt / totalRouted * 100);
    if (topPct > 50) {
      insights.push({
        type: 'warning',
        title: 'Warehouse Load Imbalance',
        description: `${whDist[0].name} handles ${topPct.toFixed(0)}% of all routed orders. This creates dependency risk.`,
        metric: `${topPct.toFixed(0)}%`,
        recommendation: 'Consider redistributing inventory to balance load across warehouses.',
      });
    }
  }

  // 3. Inventory Risk (critical shelf life)
  const invHealth = getInventoryHealthSummary();
  if (invHealth.critical_units > 0) {
    insights.push({
      type: 'critical',
      title: 'Critical Shelf Life Inventory',
      description: `${invHealth.critical_units.toLocaleString()} units (${invHealth.critical_skus} SKUs) have shelf life below 30%. These need immediate attention.`,
      metric: `${invHealth.critical_units.toLocaleString()} units`,
      recommendation: 'Prioritize these SKUs for immediate dispatch or markdowns to prevent wastage.',
    });
  }
  if (invHealth.warning_units > 0) {
    insights.push({
      type: 'warning',
      title: 'Shelf Life Approaching Critical',
      description: `${invHealth.warning_units.toLocaleString()} units (${invHealth.warning_skus} SKUs) have shelf life between 30-60%. These are at risk.`,
      metric: `${invHealth.warning_units.toLocaleString()} units`,
      recommendation: 'Monitor these SKUs closely and prioritize in routing to clear aging stock.',
    });
  }

  // 4. High Split Rate
  const splitCount = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE status = 'split' AND ${MP_FILTER}`).get(...MP_PARAMS).count;
  if (total > 0 && splitCount / total > 0.15) {
    insights.push({
      type: 'warning',
      title: 'High Order Split Rate',
      description: `${(splitCount / total * 100).toFixed(1)}% of orders are being split across multiple warehouses, increasing shipping costs.`,
      metric: `${splitCount} splits`,
      recommendation: 'Rebalance inventory across warehouses to reduce splits. Focus on high-demand SKUs.',
    });
  }

  // 5. Distance Optimization
  const avgDist = db.prepare(`
    SELECT ROUND(AVG(r.distance_km), 0) as avg_km FROM routing_results r WHERE r.failure_reason IS NULL AND r.distance_km > 0
  `).get();
  if (avgDist?.avg_km > 500) {
    insights.push({
      type: 'info',
      title: 'High Average Routing Distance',
      description: `Average routing distance is ${avgDist.avg_km} km. Orders are traveling far from warehouses.`,
      metric: `${avgDist.avg_km} km`,
      recommendation: 'Consider expanding warehouse coverage or positioning inventory closer to demand centers.',
    });
  }

  // 6. Shelf Life Decay (40-60% slab = at risk)
  const atRisk = db.prepare(`
    SELECT COUNT(DISTINCT sku) as skus, COALESCE(SUM(quantity), 0) as units
    FROM inventory WHERE status = 'Available' AND shelf_life_pct >= 40 AND shelf_life_pct < 60 AND warehouse_id IS NOT NULL
  `).get();
  if (atRisk.units > 0) {
    insights.push({
      type: 'info',
      title: 'Inventory Approaching Warning Zone',
      description: `${atRisk.units.toLocaleString()} units (${atRisk.skus} SKUs) have shelf life between 40-60% and will soon enter the warning zone.`,
      metric: `${atRisk.skus} SKUs at risk`,
      recommendation: 'Prioritize these SKUs in routing to clear them before they become critical.',
    });
  }

  res.json({ insights, generatedAt: new Date().toISOString() });
});

// GET /api/dashboard/unfulfillable-alerts — Orders that cannot be fulfilled
router.get('/unfulfillable-alerts', (req, res) => {
  const db = getDb();

  const byReason = db.prepare(`
    SELECT r.failure_reason, COUNT(DISTINCT r.order_id) as order_count,
           GROUP_CONCAT(DISTINCT oi.marketplace_sku) as affected_skus,
           COUNT(DISTINCT oi.marketplace_sku) as sku_count
    FROM routing_results r
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN orders o ON o.id = r.order_id
    WHERE r.failure_reason IS NOT NULL AND o.status = 'failed' AND ${MP_FILTER}
    GROUP BY r.failure_reason
    ORDER BY order_count DESC
  `).all(...MP_PARAMS);

  const totalUnfulfillable = db.prepare(`
    SELECT COUNT(*) as count FROM orders o WHERE o.status = 'failed' AND ${MP_FILTER}
  `).get(...MP_PARAMS).count;

  const recentUnfulfillable = db.prepare(`
    SELECT o.id, o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
           GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus,
           GROUP_CONCAT(DISTINCT r.failure_reason) as reasons
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN routing_results r ON r.order_id = o.id AND r.failure_reason IS NOT NULL
    WHERE o.status = 'failed' AND ${MP_FILTER}
    GROUP BY o.id
    ORDER BY o.order_date DESC
    LIMIT 20
  `).all(...MP_PARAMS);

  res.json({
    totalUnfulfillable,
    byReason,
    recentOrders: recentUnfulfillable,
  });
});

module.exports = router;
