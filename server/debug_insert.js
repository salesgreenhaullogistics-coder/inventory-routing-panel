require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('./db/database');

const db = getDb();

// Check if there are existing order_items with FK references that prevent deletion
const existingOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get();
const existingItems = db.prepare('SELECT COUNT(*) as c FROM order_items').get();
const existingRouting = db.prepare('SELECT COUNT(*) as c FROM routing_results').get();
console.log('Existing orders:', existingOrders.c);
console.log('Existing items:', existingItems.c);
console.log('Existing routing:', existingRouting.c);

// Check PRAGMA foreign_keys
const fk = db.prepare('PRAGMA foreign_keys').get();
console.log('Foreign keys enabled:', fk);

// Try a simple test insert
try {
  db.prepare("INSERT INTO orders (easyecom_order_id, order_date, shipping_pincode) VALUES ('TEST123', '2026-03-12', '110001') ON CONFLICT(easyecom_order_id) DO UPDATE SET order_date = excluded.order_date").run();
  const testOrder = db.prepare("SELECT id FROM orders WHERE easyecom_order_id = 'TEST123'").get();
  console.log('Test order inserted, id:', testOrder.id);

  db.prepare("INSERT INTO order_items (order_id, marketplace_sku, quantity, weight_per_unit_kg) VALUES (?, 'TEST-SKU', 1, 0.5)").run(testOrder.id);
  console.log('Test item inserted OK');

  // Cleanup
  db.prepare("DELETE FROM order_items WHERE order_id = ?").run(testOrder.id);
  db.prepare("DELETE FROM orders WHERE id = ?").run(testOrder.id);
  console.log('Cleanup done');
} catch(e) {
  console.error('Test insert error:', e.message);
}

// Check if the issue is with the inventory table FK
const invCount = db.prepare('SELECT COUNT(*) as c FROM inventory').get();
console.log('Existing inventory:', invCount.c);
