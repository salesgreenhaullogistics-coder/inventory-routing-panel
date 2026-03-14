require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('./db/database');

const db = getDb();

// Insert an order
db.prepare("INSERT OR IGNORE INTO orders (easyecom_order_id, order_date, shipping_pincode) VALUES ('TEST456', '2026-03-12', '110001')").run();

// Now upsert (conflict case)
const result = db.prepare(`
  INSERT INTO orders (easyecom_order_id, order_date, shipping_pincode, marketplace, customer_name, company_name, total_weight_kg)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(easyecom_order_id) DO UPDATE SET
    order_date = excluded.order_date,
    shipping_pincode = excluded.shipping_pincode,
    marketplace = excluded.marketplace,
    customer_name = excluded.customer_name,
    company_name = excluded.company_name,
    total_weight_kg = excluded.total_weight_kg,
    synced_at = datetime('now')
`).run('TEST456', '2026-03-12', '110001', 'Test', 'Test Customer', 'Test Co', 0);

console.log('lastInsertRowid:', result.lastInsertRowid);
console.log('changes:', result.changes);

const actual = db.prepare('SELECT id FROM orders WHERE easyecom_order_id = ?').get('TEST456');
console.log('Actual ID from SELECT:', actual?.id);

// Cleanup
db.prepare("DELETE FROM orders WHERE easyecom_order_id = 'TEST456'").run();
console.log('Done');
