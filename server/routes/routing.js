const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

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

  res.json({
    results,
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

  res.json({ splits });
});

module.exports = router;
