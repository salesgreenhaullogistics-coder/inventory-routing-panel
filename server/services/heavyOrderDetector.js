const { getDb } = require('../db/database');
const { ROUTING_CONFIG } = require('../utils/constants');

function checkHeavyOrder(orderId) {
  const db = getDb();

  // Calculate total weight from order items
  const result = db.prepare(`
    SELECT COALESCE(SUM(quantity * weight_per_unit_kg), 0) as total_weight
    FROM order_items WHERE order_id = ?
  `).get(orderId);

  // Also check the order-level weight
  const order = db.prepare('SELECT total_weight_kg FROM orders WHERE id = ?').get(orderId);
  const totalWeight = Math.max(result.total_weight, order?.total_weight_kg || 0);

  if (totalWeight > ROUTING_CONFIG.HEAVY_ORDER_THRESHOLD_KG) {
    db.prepare(`
      INSERT OR REPLACE INTO heavy_orders (order_id, total_weight_kg)
      VALUES (?, ?)
    `).run(orderId, totalWeight);

    db.prepare("UPDATE orders SET status = 'heavy' WHERE id = ?").run(orderId);

    return { isHeavy: true, totalWeight };
  }

  return { isHeavy: false, totalWeight };
}

module.exports = { checkHeavyOrder };
