const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { routeOrder, routeAllPending } = require('../services/routingEngine');
const { ALLOWED_MARKETPLACES } = require('../utils/constants');

const MP_FILTER = `o.marketplace IN (${ALLOWED_MARKETPLACES.map(() => '?').join(',')})`;

// GET /api/orders
router.get('/', (req, res) => {
  const db = getDb();
  const { status, dateFrom, dateTo, sku, marketplace, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = MP_FILTER;
  const params = [...ALLOWED_MARKETPLACES];

  if (status) { where += ' AND o.status = ?'; params.push(status); }
  if (dateFrom) { where += ' AND o.order_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND o.order_date <= ?'; params.push(dateTo); }
  if (marketplace) { where += ' AND o.marketplace LIKE ?'; params.push(`%${marketplace}%`); }
  if (sku) {
    where += ' AND o.id IN (SELECT order_id FROM order_items WHERE marketplace_sku LIKE ?)';
    params.push(`%${sku}%`);
  }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM orders o WHERE ${where}`).get(...params);

  const orders = db.prepare(`
    SELECT o.id, o.easyecom_order_id, o.reference_code, o.order_date, o.shipping_pincode,
           o.marketplace, o.customer_name, o.company_name, o.total_weight_kg,
           o.order_status_easyecom, o.status, o.synced_at, o.processed_at,
           GROUP_CONCAT(DISTINCT oi.marketplace_sku) as skus
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

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const routing = db.prepare(`
    SELECT r.*, w.name as warehouse_name
    FROM routing_results r
    LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE r.order_id = ?
    ORDER BY r.order_item_id, r.warehouse_rank
  `).all(order.id);

  res.json({ order, items, routing });
});

// POST /api/orders/:id/route
router.post('/:id/route', async (req, res, next) => {
  try {
    const db = getDb();
    // Clear previous routing results
    db.prepare('DELETE FROM routing_results WHERE order_id = ?').run(req.params.id);
    db.prepare("UPDATE orders SET status = 'pending' WHERE id = ?").run(req.params.id);

    const result = await routeOrder(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/route-all
router.post('/route-all', async (req, res, next) => {
  try {
    const result = await routeAllPending();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
