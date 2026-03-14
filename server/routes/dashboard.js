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

  res.json({
    total, routed, failed, split, heavy, pending, created,
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
      ROUND(AVG(r.cost_score), 4) as avg_cost_score
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

// GET /api/dashboard/bad-inventory
router.get('/bad-inventory', (req, res) => {
  const badInventory = getBadInventory();
  res.json(badInventory);
});

module.exports = router;
