const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const easyecomApi = require('../services/easyecomApi');

// Map warehouse/company names from EasyEcom to our warehouse IDs
const WAREHOUSE_NAME_MAP = [
  { id: 1, keywords: ['bangalore', 'blr', 'emiza bangalore', 'nlm'] },
  { id: 2, keywords: ['ggn', 'gurgaon', 'gurugram', 'prozo ggn', 'prozo- ggn', 'prozo gurgaon'] },
  { id: 3, keywords: ['kolkata', 'emiza kolkata', 'calcutta'] },
  { id: 4, keywords: ['bhiwandi', 'prozo bhiwandi', 'd2c'] },
];

function matchWarehouseId(warehouseName) {
  if (!warehouseName) return null;
  const name = warehouseName.toLowerCase();

  for (const wh of WAREHOUSE_NAME_MAP) {
    for (const kw of wh.keywords) {
      if (name.includes(kw)) return wh.id;
    }
  }

  const db = getDb();
  const exact = db.prepare('SELECT id FROM warehouses WHERE LOWER(name) = ?').get(name);
  if (exact) return exact.id;
  const partial = db.prepare('SELECT id FROM warehouses WHERE LOWER(name) LIKE ?').get(`%${name}%`);
  return partial?.id || null;
}

// POST /api/sync/orders
router.post('/orders', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const db = getDb();

    const syncLog = db.prepare(
      "INSERT INTO sync_log (sync_type, started_at) VALUES ('orders', datetime('now'))"
    ).run();

    let orders;
    try {
      orders = await easyecomApi.fetchOrders(start, end);
    } catch (err) {
      db.prepare(
        "UPDATE sync_log SET completed_at = datetime('now'), status = 'failed' WHERE id = ?"
      ).run(syncLog.lastInsertRowid);
      throw err;
    }

    // *** FILTER: Only process orders where Order Status (Column K) = "Pending" ***
    const pendingOrders = orders.filter(order => {
      const status = (order.order_status || '').trim().toLowerCase();
      return status === 'open' || status === 'pending';
    });

    console.log(`[Sync] Total fetched: ${orders.length}, Pending only: ${pendingOrders.length}`);

    const upsertOrder = db.prepare(`
      INSERT INTO orders (easyecom_order_id, reference_code, order_date, shipping_pincode, marketplace, customer_name, company_name, total_weight_kg, order_status_easyecom, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(easyecom_order_id) DO UPDATE SET
        reference_code = excluded.reference_code,
        order_date = excluded.order_date,
        shipping_pincode = excluded.shipping_pincode,
        marketplace = excluded.marketplace,
        customer_name = excluded.customer_name,
        company_name = excluded.company_name,
        total_weight_kg = excluded.total_weight_kg,
        order_status_easyecom = excluded.order_status_easyecom,
        raw_data = excluded.raw_data,
        synced_at = datetime('now')
    `);

    const upsertItem = db.prepare(`
      INSERT INTO order_items (order_id, marketplace_sku, quantity, weight_per_unit_kg)
      VALUES (?, ?, ?, ?)
    `);

    let synced = 0;
    let skipped = 0;

    const findOrder = db.prepare('SELECT id FROM orders WHERE easyecom_order_id = ?');
    const deleteRelated = db.prepare('DELETE FROM routing_results WHERE order_id = ?');
    const deletePincodeErr = db.prepare('DELETE FROM pincode_errors WHERE order_id = ?');
    const deleteHeavy = db.prepare('DELETE FROM heavy_orders WHERE order_id = ?');
    const deleteItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');
    const resetStatus = db.prepare("UPDATE orders SET status = 'pending', processed_at = NULL WHERE id = ?");

    for (const order of pendingOrders) {
      if (!order.easyecom_order_id) continue;

      try {
        const insertSingle = db.transaction(() => {
          upsertOrder.run(
            order.easyecom_order_id,
            order.reference_code || '',
            order.order_date || '1970-01-01',
            order.shipping_pincode,
            order.marketplace,
            order.customer_name,
            order.company_name,
            order.total_weight_kg,
            order.order_status || '',
            order.raw_data || '[]'
          );

          const row = findOrder.get(order.easyecom_order_id);
          const orderId = row?.id;

          if (orderId && order.items && order.items.length > 0) {
            deleteRelated.run(orderId);
            deletePincodeErr.run(orderId);
            deleteHeavy.run(orderId);
            deleteItems.run(orderId);
            resetStatus.run(orderId);
            for (const item of order.items) {
              if (!item.marketplace_sku && !item.sku) continue;
              upsertItem.run(orderId, item.marketplace_sku || item.sku, item.quantity, item.weight_per_unit_kg);
            }
          }
        });
        insertSingle();
        synced++;
      } catch (err) {
        skipped++;
        console.error(`[Sync] Skipped order ${order.easyecom_order_id}: ${err.message}`);
      }
    }

    console.log(`[Sync] Orders synced: ${synced}, skipped: ${skipped}`);

    db.prepare(`
      UPDATE sync_log SET completed_at = datetime('now'), records_fetched = ?, status = 'completed'
      WHERE id = ?
    `).run(synced, syncLog.lastInsertRowid);

    res.json({ success: true, totalFetched: orders.length, pendingFiltered: pendingOrders.length, recordsSynced: synced, dateRange: { start, end } });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync/inventory
router.post('/inventory', async (req, res, next) => {
  try {
    const db = getDb();

    const syncLog = db.prepare(
      "INSERT INTO sync_log (sync_type, started_at) VALUES ('inventory', datetime('now'))"
    ).run();

    let inventory;
    try {
      inventory = await easyecomApi.fetchInventory();
    } catch (err) {
      db.prepare(
        "UPDATE sync_log SET completed_at = datetime('now'), status = 'failed' WHERE id = ?"
      ).run(syncLog.lastInsertRowid);
      throw err;
    }

    const clearAndInsert = db.transaction(() => {
      db.prepare('DELETE FROM inventory').run();

      const stmt = db.prepare(`
        INSERT INTO inventory (company_name, sku, warehouse_id, warehouse_name, quantity, status, shelf_life_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of inventory) {
        const warehouseId = matchWarehouseId(item.warehouse_name || item.company_name);
        try {
          stmt.run(
            item.company_name, item.sku, warehouseId, item.warehouse_name || item.company_name,
            item.quantity, item.status, item.shelf_life_pct
          );
        } catch (err) {
          console.error(`[Sync] Skipped inventory ${item.sku}: ${err.message}`);
        }
      }
    });

    clearAndInsert();

    db.prepare(`
      UPDATE sync_log SET completed_at = datetime('now'), records_fetched = ?, status = 'completed'
      WHERE id = ?
    `).run(inventory.length, syncLog.lastInsertRowid);

    const validCount = db.prepare(
      "SELECT COUNT(*) as count FROM inventory WHERE status = 'Available' AND shelf_life_pct >= 60"
    ).get();

    res.json({
      success: true,
      totalRecords: inventory.length,
      validRecords: validCount.count,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sync/status
router.get('/status', (req, res) => {
  const db = getDb();
  const latest = db.prepare(
    'SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 10'
  ).all();

  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory').get();

  res.json({
    syncHistory: latest,
    counts: { orders: orderCount.count, inventory: inventoryCount.count },
    autoSyncInterval: parseInt(process.env.AUTO_SYNC_INTERVAL || '15', 10),
  });
});

// DEBUG: Fetch raw EasyEcom inventory sample to inspect fields
router.get('/inventory-raw-sample', async (req, res, next) => {
  try {
    await easyecomApi.ensureAuth();
    const result = await easyecomApi.request('GET', '/getInventoryDetailsV3', null, { includeLocations: 1, limit: 5 });
    res.json({ rawResponse: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
