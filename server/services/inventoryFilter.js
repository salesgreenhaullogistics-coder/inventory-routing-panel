const { getDb } = require('../db/database');
const { ROUTING_CONFIG, FAILURE_REASONS } = require('../utils/constants');

function getValidInventory(sku, companyName, warehouseId) {
  const db = getDb();

  // First check if SKU exists at this warehouse at all
  const skuExists = db.prepare(
    'SELECT id, quantity, status, shelf_life_pct, company_name FROM inventory WHERE sku = ? AND warehouse_id = ?'
  ).get(sku, warehouseId);

  if (!skuExists) {
    return { available: false, quantity: 0, reason: FAILURE_REASONS.SKU_NOT_FOUND };
  }

  // Company name matching skipped — warehouse routing by distance handles location assignment

  // Check status
  if (skuExists.status !== ROUTING_CONFIG.REQUIRED_STATUS) {
    return { available: false, quantity: 0, reason: FAILURE_REASONS.NO_INVENTORY };
  }

  // Check shelf life
  if (skuExists.shelf_life_pct < ROUTING_CONFIG.MIN_SHELF_LIFE_PCT) {
    return { available: false, quantity: 0, reason: FAILURE_REASONS.LOW_SHELF_LIFE };
  }

  // Get total available quantity (sum all matching rows)
  const total = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total_qty FROM inventory
    WHERE sku = ? AND warehouse_id = ?
      AND status = ? AND shelf_life_pct >= ?
  `).get(sku, warehouseId, ROUTING_CONFIG.REQUIRED_STATUS, ROUTING_CONFIG.MIN_SHELF_LIFE_PCT);

  if (total.total_qty <= 0) {
    return { available: false, quantity: 0, reason: FAILURE_REASONS.NO_INVENTORY };
  }

  return { available: true, quantity: total.total_qty, reason: null };
}

module.exports = { getValidInventory };
