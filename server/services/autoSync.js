const { getDb } = require('../db/database');
const easyecomApi = require('./easyecomApi');

let syncInterval = null;

function matchWarehouseId(warehouseName) {
  if (!warehouseName) return null;
  const db = getDb();
  const name = warehouseName.toLowerCase();

  const WAREHOUSE_NAME_MAP = [
    { id: 1, keywords: ['bangalore', 'blr', 'emiza bangalore', 'nlm'] },
    { id: 2, keywords: ['ggn', 'gurgaon', 'gurugram', 'prozo ggn', 'prozo- ggn', 'prozo gurgaon'] },
    { id: 3, keywords: ['kolkata', 'emiza kolkata', 'calcutta'] },
    { id: 4, keywords: ['bhiwandi', 'prozo bhiwandi', 'd2c'] },
  ];

  for (const wh of WAREHOUSE_NAME_MAP) {
    for (const kw of wh.keywords) {
      if (name.includes(kw)) return wh.id;
    }
  }

  const exact = db.prepare('SELECT id FROM warehouses WHERE LOWER(name) = ?').get(name);
  if (exact) return exact.id;
  const partial = db.prepare('SELECT id FROM warehouses WHERE LOWER(name) LIKE ?').get(`%${name}%`);
  return partial?.id || null;
}

async function syncOrders() {
  const db = getDb();
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const syncLog = db.prepare(
    "INSERT INTO sync_log (sync_type, started_at) VALUES ('orders', datetime('now'))"
  ).run();

  try {
    const orders = await easyecomApi.fetchOrders(start, end);

    // *** FILTER: Only process orders where Order Status (Column K) = "Pending" ***
    const pendingOrders = orders.filter(order => {
      const status = (order.order_status || '').trim().toLowerCase();
      return status === 'open' || status === 'pending';
    });

    console.log(`[AutoSync] Total fetched: ${orders.length}, Pending only: ${pendingOrders.length}`);

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
    db.transaction(() => {
      for (const order of pendingOrders) {
        if (!order.easyecom_order_id) continue;
        try {
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

          const row = db.prepare('SELECT id FROM orders WHERE easyecom_order_id = ?').get(order.easyecom_order_id);
          const orderId = row?.id;
          if (orderId && order.items?.length > 0) {
            db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
            for (const item of order.items) {
              if (!item.marketplace_sku && !item.sku) continue;
              upsertItem.run(orderId, item.marketplace_sku || item.sku, item.quantity, item.weight_per_unit_kg);
            }
          }
          synced++;
        } catch (err) {
          console.error(`[AutoSync] Skipped order ${order.easyecom_order_id}: ${err.message}`);
        }
      }
    })();

    db.prepare(
      "UPDATE sync_log SET completed_at = datetime('now'), records_fetched = ?, status = 'completed' WHERE id = ?"
    ).run(synced, syncLog.lastInsertRowid);

    console.log(`[AutoSync] Orders synced: ${synced}`);
    return synced;
  } catch (err) {
    db.prepare(
      "UPDATE sync_log SET completed_at = datetime('now'), status = 'failed' WHERE id = ?"
    ).run(syncLog.lastInsertRowid);
    console.error('[AutoSync] Order sync failed:', err.message);
    return 0;
  }
}

async function syncInventory() {
  const db = getDb();

  const syncLog = db.prepare(
    "INSERT INTO sync_log (sync_type, started_at) VALUES ('inventory', datetime('now'))"
  ).run();

  try {
    const inventory = await easyecomApi.fetchInventory();

    db.transaction(() => {
      // Save existing shelf_life_pct values before clearing (EasyEcom doesn't provide shelf life)
      const existingShelfLife = {};
      const rows = db.prepare('SELECT sku, warehouse_id, shelf_life_pct FROM inventory WHERE shelf_life_pct != 100').all();
      for (const row of rows) {
        existingShelfLife[`${row.sku}__${row.warehouse_id}`] = row.shelf_life_pct;
      }

      db.prepare('DELETE FROM inventory').run();
      const stmt = db.prepare(`
        INSERT INTO inventory (company_name, sku, warehouse_id, warehouse_name, quantity, status, shelf_life_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of inventory) {
        const warehouseId = matchWarehouseId(item.warehouse_name || item.company_name);
        // Restore previously set shelf_life_pct if it exists
        const key = `${item.sku}__${warehouseId}`;
        const shelfLife = existingShelfLife[key] !== undefined ? existingShelfLife[key] : item.shelf_life_pct;
        stmt.run(
          item.company_name, item.sku, warehouseId, item.warehouse_name || item.company_name,
          item.quantity, item.status, shelfLife
        );
      }
    })();

    db.prepare(
      "UPDATE sync_log SET completed_at = datetime('now'), records_fetched = ?, status = 'completed' WHERE id = ?"
    ).run(inventory.length, syncLog.lastInsertRowid);

    console.log(`[AutoSync] Inventory synced: ${inventory.length}`);
    return inventory.length;
  } catch (err) {
    db.prepare(
      "UPDATE sync_log SET completed_at = datetime('now'), status = 'failed' WHERE id = ?"
    ).run(syncLog.lastInsertRowid);
    console.error('[AutoSync] Inventory sync failed:', err.message);
    return 0;
  }
}

async function runAutoSync() {
  console.log(`[AutoSync] Running at ${new Date().toISOString()}`);
  await syncOrders();
  await syncInventory();
}

function startAutoSync() {
  const intervalMinutes = parseInt(process.env.AUTO_SYNC_INTERVAL || '15', 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[AutoSync] Starting auto-sync every ${intervalMinutes} minutes`);

  // Run first sync after 30 seconds (give server time to start)
  setTimeout(() => {
    runAutoSync().catch(err => console.error('[AutoSync] Error:', err.message));
  }, 30000);

  // Then run on interval
  syncInterval = setInterval(() => {
    runAutoSync().catch(err => console.error('[AutoSync] Error:', err.message));
  }, intervalMs);
}

function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[AutoSync] Stopped');
  }
}

module.exports = { startAutoSync, stopAutoSync, runAutoSync, syncOrders, syncInventory };
