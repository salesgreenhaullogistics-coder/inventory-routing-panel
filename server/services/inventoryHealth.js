const { getDb } = require('../db/database');
const { INVENTORY_HEALTH } = require('../utils/constants');

/**
 * Inventory Health Engine
 *
 * Categories:
 * - Healthy: shelf_life_pct >= 60%
 * - Warning: shelf_life_pct 30-60%
 * - Critical: shelf_life_pct < 30%
 *
 * Also tracks:
 * - Stock levels per warehouse per SKU
 * - Low inventory alerts
 * - Warehouse-level health summary
 */

function getInventoryHealthSummary() {
  const db = getDb();

  // Only count inventory that is Available AND shelf_life_pct >= 60% AND belongs to a configured warehouse
  const health = db.prepare(`
    SELECT
      SUM(quantity) as healthy_units,
      COUNT(DISTINCT sku) as healthy_skus,
      SUM(quantity) as total_units,
      COUNT(*) as total_records
    FROM inventory
    WHERE status = 'Available' AND shelf_life_pct >= ${INVENTORY_HEALTH.HEALTHY_MIN} AND warehouse_id IS NOT NULL
  `).get();

  // Warning and critical are tracked separately in bad inventory
  return {
    ...health,
    warning_units: 0,
    warning_skus: 0,
    critical_units: 0,
    critical_skus: 0,
  };
}

function getWarehouseHealthSummary() {
  const db = getDb();

  // Only count Available + shelf_life >= 60% as usable inventory
  const warehouseHealth = db.prepare(`
    SELECT
      w.id as warehouse_id,
      w.name as warehouse_name,
      w.current_load,
      w.max_capacity,
      ROUND(CAST(w.current_load AS REAL) / NULLIF(w.max_capacity, 0) * 100, 1) as load_pct,
      COUNT(DISTINCT i.sku) as total_skus,
      COALESCE(SUM(i.quantity), 0) as total_units,
      COUNT(CASE WHEN i.quantity <= 5 AND i.quantity > 0 THEN 1 END) as low_stock_skus,
      COUNT(CASE WHEN i.quantity = 0 THEN 1 END) as out_of_stock_skus
    FROM warehouses w
    LEFT JOIN inventory i ON i.warehouse_id = w.id AND i.status = 'Available' AND i.shelf_life_pct >= ${INVENTORY_HEALTH.HEALTHY_MIN}
    GROUP BY w.id
    ORDER BY w.priority
  `).all();

  return warehouseHealth;
}

function getLowInventoryAlerts() {
  const db = getDb();

  // SKUs with low stock (<=10 units across all warehouses)
  const lowStock = db.prepare(`
    SELECT
      i.sku,
      i.warehouse_id,
      w.name as warehouse_name,
      i.quantity,
      i.shelf_life_pct,
      CASE
        WHEN i.quantity = 0 THEN 'Out of Stock'
        WHEN i.quantity <= 5 THEN 'Critical Low'
        WHEN i.quantity <= 10 THEN 'Low Stock'
        ELSE 'OK'
      END as stock_alert,
      CASE
        WHEN i.shelf_life_pct < ${INVENTORY_HEALTH.CRITICAL_MAX} THEN 'Critical'
        WHEN i.shelf_life_pct < ${INVENTORY_HEALTH.HEALTHY_MIN} THEN 'Warning'
        ELSE 'Healthy'
      END as health_status
    FROM inventory i
    JOIN warehouses w ON w.id = i.warehouse_id
    WHERE i.status = 'Available' AND (i.quantity <= 10 OR i.shelf_life_pct < ${INVENTORY_HEALTH.HEALTHY_MIN})
    ORDER BY i.quantity ASC, i.shelf_life_pct ASC
    LIMIT 100
  `).all();

  return lowStock;
}

function getInventoryByHealthCategory() {
  const db = getDb();

  const categories = db.prepare(`
    SELECT
      CASE
        WHEN shelf_life_pct >= ${INVENTORY_HEALTH.HEALTHY_MIN} THEN 'Healthy'
        WHEN shelf_life_pct >= ${INVENTORY_HEALTH.WARNING_MIN} THEN 'Warning'
        ELSE 'Critical'
      END as category,
      sku,
      warehouse_id,
      quantity,
      shelf_life_pct,
      company_name
    FROM inventory
    WHERE status = 'Available'
    ORDER BY shelf_life_pct ASC
  `).all();

  return categories;
}

/**
 * Bad Inventory: SKUs with shelf_life_pct < 60%, grouped by warehouse and slab
 * Slabs: 0-20%, 20-40%, 40-60%
 */
function getBadInventory() {
  const db = getDb();

  // Summary by warehouse and slab
  const slabSummary = db.prepare(`
    SELECT
      w.id as warehouse_id,
      w.name as warehouse_name,
      CASE
        WHEN i.shelf_life_pct < 20 THEN '0-20%'
        WHEN i.shelf_life_pct < 40 THEN '20-40%'
        ELSE '40-60%'
      END as slab,
      COUNT(DISTINCT i.sku) as sku_count,
      COALESCE(SUM(i.quantity), 0) as total_units
    FROM inventory i
    JOIN warehouses w ON w.id = i.warehouse_id
    WHERE i.status = 'Available' AND i.shelf_life_pct < ${INVENTORY_HEALTH.HEALTHY_MIN}
    GROUP BY w.id, slab
    ORDER BY w.priority, i.shelf_life_pct ASC
  `).all();

  // Detailed SKU-level breakdown
  const details = db.prepare(`
    SELECT
      i.sku,
      w.id as warehouse_id,
      w.name as warehouse_name,
      i.quantity,
      i.shelf_life_pct,
      i.company_name,
      CASE
        WHEN i.shelf_life_pct < 20 THEN '0-20%'
        WHEN i.shelf_life_pct < 40 THEN '20-40%'
        ELSE '40-60%'
      END as slab
    FROM inventory i
    JOIN warehouses w ON w.id = i.warehouse_id
    WHERE i.status = 'Available' AND i.shelf_life_pct < ${INVENTORY_HEALTH.HEALTHY_MIN}
    ORDER BY i.shelf_life_pct ASC, i.quantity DESC
  `).all();

  // Overall totals
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT sku) as total_bad_skus,
      COALESCE(SUM(quantity), 0) as total_bad_units,
      SUM(CASE WHEN shelf_life_pct < 20 THEN quantity ELSE 0 END) as units_0_20,
      SUM(CASE WHEN shelf_life_pct >= 20 AND shelf_life_pct < 40 THEN quantity ELSE 0 END) as units_20_40,
      SUM(CASE WHEN shelf_life_pct >= 40 AND shelf_life_pct < 60 THEN quantity ELSE 0 END) as units_40_60,
      COUNT(CASE WHEN shelf_life_pct < 20 THEN 1 END) as skus_0_20,
      COUNT(CASE WHEN shelf_life_pct >= 20 AND shelf_life_pct < 40 THEN 1 END) as skus_20_40,
      COUNT(CASE WHEN shelf_life_pct >= 40 AND shelf_life_pct < 60 THEN 1 END) as skus_40_60
    FROM inventory
    WHERE status = 'Available' AND shelf_life_pct < ${INVENTORY_HEALTH.HEALTHY_MIN} AND warehouse_id IS NOT NULL
  `).get();

  return { slabSummary, details, totals };
}

module.exports = {
  getInventoryHealthSummary,
  getWarehouseHealthSummary,
  getLowInventoryAlerts,
  getInventoryByHealthCategory,
  getBadInventory,
};
