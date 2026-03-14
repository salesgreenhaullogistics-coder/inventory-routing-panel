require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('./db/database');
const easyecomApi = require('./services/easyecomApi');

(async () => {
  const db = getDb();
  const orders = await easyecomApi.fetchOrders('2026-03-11', '2026-03-12');
  console.log('Total orders:', orders.length);

  const upsertOrder = db.prepare(`
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
  `);

  const upsertItem = db.prepare(`
    INSERT INTO order_items (order_id, marketplace_sku, quantity, weight_per_unit_kg)
    VALUES (?, ?, ?, ?)
  `);

  let synced = 0;
  let failed = 0;

  for (const order of orders) {
    if (!order.easyecom_order_id) continue;
    try {
      const result = upsertOrder.run(
        order.easyecom_order_id, order.order_date || '1970-01-01', order.shipping_pincode,
        order.marketplace, order.customer_name, order.company_name, order.total_weight_kg
      );

      const orderId = result.lastInsertRowid ||
        db.prepare('SELECT id FROM orders WHERE easyecom_order_id = ?').get(order.easyecom_order_id)?.id;

      if (orderId && order.items && order.items.length > 0) {
        db.prepare('DELETE FROM routing_results WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM pincode_errors WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM heavy_orders WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
        db.prepare("UPDATE orders SET status = 'pending', processed_at = NULL WHERE id = ?").run(orderId);
        for (const item of order.items) {
          if (!item.marketplace_sku && !item.sku) continue;
          upsertItem.run(orderId, item.marketplace_sku || item.sku, item.quantity, item.weight_per_unit_kg);
        }
      }
      synced++;
    } catch (e) {
      failed++;
      console.error(`FAILED order ${order.easyecom_order_id}:`, e.message);
      console.error('  order_date:', order.order_date);
      console.error('  items:', order.items?.length);
      if (failed >= 3) break;
    }
  }
  console.log('Synced:', synced, 'Failed:', failed);
})();
