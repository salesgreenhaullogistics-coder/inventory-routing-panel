const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/pincodes/validate/:pincode
router.get('/validate/:pincode', (req, res) => {
  const db = getDb();
  const result = db.prepare('SELECT * FROM pincodes WHERE pincode = ?').get(req.params.pincode);

  if (result) {
    res.json({ valid: true, ...result });
  } else {
    const prefix = req.params.pincode.substring(0, 4);
    const suggestions = db.prepare(
      'SELECT pincode, office_name, district, state FROM pincodes WHERE pincode LIKE ? LIMIT 5'
    ).all(prefix + '%');

    res.json({ valid: false, suggestions });
  }
});

// GET /api/pincodes/errors
router.get('/errors', (req, res) => {
  const db = getDb();
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countResult = db.prepare('SELECT COUNT(*) as total FROM pincode_errors').get();

  const errors = db.prepare(`
    SELECT pe.*, o.easyecom_order_id, o.reference_code, o.order_date, o.customer_name, o.marketplace
    FROM pincode_errors pe
    JOIN orders o ON o.id = pe.order_id
    ORDER BY pe.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  res.json({
    errors,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult.total,
      pages: Math.ceil(countResult.total / parseInt(limit)),
    },
  });
});

module.exports = router;
