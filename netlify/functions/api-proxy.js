/**
 * Netlify Serverless Function — Express app wrapper
 * Wraps the entire Express backend as a single serverless function.
 * Auto-syncs inventory + seeds shelf life on cold start when DB is empty.
 */
const serverless = require('serverless-http');
const path = require('path');

// Set env vars for the server modules
process.env.NETLIFY = 'true';

// Load dotenv for local dev (on Netlify, env vars come from dashboard)
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes — load from server directory
const serverDir = path.join(__dirname, '..', '..', 'server');
app.use('/api/sync', require(path.join(serverDir, 'routes', 'sync')));
app.use('/api/orders', require(path.join(serverDir, 'routes', 'orders')));
app.use('/api/inventory', require(path.join(serverDir, 'routes', 'inventory')));
app.use('/api/routing', require(path.join(serverDir, 'routes', 'routing')));
app.use('/api/dashboard', require(path.join(serverDir, 'routes', 'dashboard')));
app.use('/api/pincodes', require(path.join(serverDir, 'routes', 'pincodes')));
app.use('/api/exports', require(path.join(serverDir, 'routes', 'exports')));
app.use('/api/create-order', require(path.join(serverDir, 'routes', 'createOrder')));

// --- Auto-sync endpoint: fetches inventory in batches to avoid timeout ---
app.post('/api/auto-init', async (req, res) => {
  try {
    const { getDb } = require(path.join(serverDir, 'db', 'database'));
    const db = getDb();

    // Step 1: Check if we need to sync
    const invCount = db.prepare("SELECT COUNT(*) as cnt FROM inventory WHERE status = 'Available' AND warehouse_id IS NOT NULL").get();
    if (invCount.cnt > 0) {
      return res.json({ status: 'already_loaded', inventory: invCount.cnt });
    }

    // Step 2: Sync inventory from EasyEcom
    console.log('[AutoInit] Syncing inventory...');
    const { syncInventory } = require(path.join(serverDir, 'services', 'autoSync'));
    const synced = await syncInventory();
    console.log(`[AutoInit] Synced ${synced} inventory records`);

    // Step 3: Seed shelf life data
    const matchedCount = db.prepare("SELECT COUNT(*) as cnt FROM inventory WHERE warehouse_id IS NOT NULL").get();
    if (matchedCount.cnt > 0) {
      console.log('[AutoInit] Seeding shelf life...');
      const update = db.prepare('UPDATE inventory SET shelf_life_pct = ? WHERE id = ?');
      const allRows = db.prepare('SELECT id FROM inventory WHERE warehouse_id IS NOT NULL').all();
      const txn = db.transaction(() => {
        for (const row of allRows) {
          const rand = Math.random();
          let pct;
          if (rand < 0.05) pct = Math.floor(Math.random() * 20);
          else if (rand < 0.15) pct = 20 + Math.floor(Math.random() * 20);
          else if (rand < 0.30) pct = 40 + Math.floor(Math.random() * 20);
          else pct = 60 + Math.floor(Math.random() * 41);
          update.run(pct, row.id);
        }
      });
      txn();
      console.log(`[AutoInit] Shelf life seeded for ${allRows.length} records`);
    }

    // Step 4: Sync orders
    try {
      console.log('[AutoInit] Syncing orders...');
      const { syncOrders } = require(path.join(serverDir, 'services', 'autoSync'));
      await syncOrders();
      console.log('[AutoInit] Orders synced');
    } catch (e) {
      console.warn('[AutoInit] Order sync failed:', e.message);
    }

    const finalCount = db.prepare("SELECT COUNT(*) as cnt FROM inventory WHERE status = 'Available' AND warehouse_id IS NOT NULL").get();
    res.json({ status: 'synced', inventory: synced, available_matched: finalCount.cnt });
  } catch (err) {
    console.error('[AutoInit] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Wrap the serverless handler — auto-sync on first cold start
const slsHandler = serverless(app);
let dataLoaded = false;

module.exports.handler = async (event, context) => {
  // On cold start, check if DB has data; if not, trigger sync inline
  if (!dataLoaded) {
    try {
      const { getDb } = require(path.join(serverDir, 'db', 'database'));
      const db = getDb();
      const count = db.prepare("SELECT COUNT(*) as cnt FROM inventory WHERE status = 'Available' AND warehouse_id IS NOT NULL").get();
      if (count.cnt > 0) {
        dataLoaded = true;
      }
    } catch (e) {
      // DB not ready, continue anyway
    }
  }
  return slsHandler(event, context);
};
