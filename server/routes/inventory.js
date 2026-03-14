const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/inventory
router.get('/', (req, res) => {
  const db = getDb();
  const { sku, warehouseId, company, minShelfLife, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];

  if (sku) { where += ' AND i.sku LIKE ?'; params.push(`%${sku}%`); }
  if (warehouseId) { where += ' AND i.warehouse_id = ?'; params.push(parseInt(warehouseId)); }
  if (company) { where += ' AND i.company_name LIKE ?'; params.push(`%${company}%`); }
  if (minShelfLife) { where += ' AND i.shelf_life_pct >= ?'; params.push(parseFloat(minShelfLife)); }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM inventory i WHERE ${where}`).get(...params);

  const inventory = db.prepare(`
    SELECT i.*, w.name as warehouse_display_name
    FROM inventory i
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    WHERE ${where}
    ORDER BY i.sku, i.warehouse_id
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    inventory,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult.total,
      pages: Math.ceil(countResult.total / parseInt(limit)),
    },
  });
});

// GET /api/inventory/summary
router.get('/summary', (req, res) => {
  const db = getDb();
  const summary = db.prepare(`
    SELECT
      w.name as warehouse_name,
      i.sku,
      SUM(i.quantity) as total_qty,
      AVG(i.shelf_life_pct) as avg_shelf_life,
      i.status,
      COUNT(*) as record_count
    FROM inventory i
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    GROUP BY i.warehouse_id, i.sku, i.status
    ORDER BY w.name, i.sku
  `).all();

  res.json({ summary });
});

// PUT /api/inventory/shelf-life — Update shelf_life_pct for specific inventory records
router.put('/shelf-life', (req, res) => {
  const db = getDb();
  const { updates } = req.body; // Array of { id, shelf_life_pct } or { sku, warehouse_id, shelf_life_pct }

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates array is required' });
  }

  const byId = db.prepare('UPDATE inventory SET shelf_life_pct = ? WHERE id = ?');
  const bySkuWh = db.prepare('UPDATE inventory SET shelf_life_pct = ? WHERE sku = ? AND warehouse_id = ?');

  let updated = 0;
  const txn = db.transaction(() => {
    for (const u of updates) {
      if (u.id) {
        const r = byId.run(u.shelf_life_pct, u.id);
        updated += r.changes;
      } else if (u.sku && u.warehouse_id) {
        const r = bySkuWh.run(u.shelf_life_pct, u.sku, u.warehouse_id);
        updated += r.changes;
      }
    }
  });

  txn();
  res.json({ success: true, updated });
});

// POST /api/inventory/seed-shelf-life — Seed random shelf life values for testing
router.post('/seed-shelf-life', (req, res) => {
  const db = getDb();

  // Get all Available inventory with quantity > 0 at our 4 warehouses
  const records = db.prepare(`
    SELECT id, sku, warehouse_id, quantity
    FROM inventory
    WHERE status = 'Available' AND quantity > 0 AND warehouse_id IS NOT NULL
  `).all();

  if (records.length === 0) {
    return res.json({ success: false, message: 'No eligible inventory records found' });
  }

  // Assign realistic shelf life distribution:
  // ~70% healthy (60-100%), ~15% warning (40-60%), ~10% low (20-40%), ~5% critical (0-20%)
  const stmt = db.prepare('UPDATE inventory SET shelf_life_pct = ? WHERE id = ?');
  let updated = 0;

  const txn = db.transaction(() => {
    for (const rec of records) {
      const rand = Math.random();
      let shelfLife;
      if (rand < 0.05) {
        shelfLife = Math.floor(Math.random() * 20); // 0-19%
      } else if (rand < 0.15) {
        shelfLife = 20 + Math.floor(Math.random() * 20); // 20-39%
      } else if (rand < 0.30) {
        shelfLife = 40 + Math.floor(Math.random() * 20); // 40-59%
      } else {
        shelfLife = 60 + Math.floor(Math.random() * 41); // 60-100%
      }
      stmt.run(shelfLife, rec.id);
      updated++;
    }
  });

  txn();

  // Get the resulting distribution
  const dist = db.prepare(`
    SELECT
      SUM(CASE WHEN shelf_life_pct < 20 THEN 1 ELSE 0 END) as slab_0_20,
      SUM(CASE WHEN shelf_life_pct >= 20 AND shelf_life_pct < 40 THEN 1 ELSE 0 END) as slab_20_40,
      SUM(CASE WHEN shelf_life_pct >= 40 AND shelf_life_pct < 60 THEN 1 ELSE 0 END) as slab_40_60,
      SUM(CASE WHEN shelf_life_pct >= 60 THEN 1 ELSE 0 END) as slab_60_plus
    FROM inventory
    WHERE status = 'Available' AND quantity > 0 AND warehouse_id IS NOT NULL
  `).get();

  res.json({ success: true, updated, distribution: dist });
});

// POST /api/inventory/reset-shelf-life — Reset all shelf life to 100%
router.post('/reset-shelf-life', (req, res) => {
  const db = getDb();
  const result = db.prepare('UPDATE inventory SET shelf_life_pct = 100').run();
  res.json({ success: true, updated: result.changes });
});

module.exports = router;
