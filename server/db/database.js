const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'inventory.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);

    // Migrate: add new columns if missing
    migrateSchema();

    // Seed warehouses if empty
    const count = db.prepare('SELECT COUNT(*) as count FROM warehouses').get();
    if (count.count === 0) {
      seedWarehouses();
    } else {
      // Update existing warehouses with new metadata
      updateWarehouseMeta();
    }
  }
  return db;
}

function seedWarehouses() {
  const warehouses = [
    { id: 1, name: 'Emiza Bangalore NLM', pincode: '562123', latitude: 13.1986, longitude: 77.7066, priority: 1, avg_delivery_days: 2.5, base_shipping_cost: 45, max_capacity: 1000 },
    { id: 2, name: 'Prozo GGN 05', pincode: '122413', latitude: 28.4595, longitude: 77.0266, priority: 2, avg_delivery_days: 3.0, base_shipping_cost: 50, max_capacity: 1200 },
    { id: 3, name: 'Emiza Kolkata', pincode: '711302', latitude: 22.5726, longitude: 88.3639, priority: 3, avg_delivery_days: 3.5, base_shipping_cost: 55, max_capacity: 800 },
    { id: 4, name: 'Prozo Bhiwandi D2C', pincode: '421302', latitude: 19.2813, longitude: 73.0483, priority: 4, avg_delivery_days: 2.0, base_shipping_cost: 40, max_capacity: 1500 },
  ];

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO warehouses (id, name, pincode, latitude, longitude, priority, avg_delivery_days, base_shipping_cost, current_load, max_capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
  );

  const insertMany = db.transaction((items) => {
    for (const w of items) {
      stmt.run(w.id, w.name, w.pincode, w.latitude, w.longitude, w.priority, w.avg_delivery_days, w.base_shipping_cost, w.max_capacity);
    }
  });

  insertMany(warehouses);

  // Try to update lat/long from pincodes table if available
  const updateFromPincodes = db.prepare(`
    UPDATE warehouses SET
      latitude = (SELECT latitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode),
      longitude = (SELECT longitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode)
    WHERE EXISTS (SELECT 1 FROM pincodes WHERE pincodes.pincode = warehouses.pincode)
  `);
  updateFromPincodes.run();
}

function migrateSchema() {
  // Add new warehouse columns if missing
  const whCols = db.prepare("PRAGMA table_info('warehouses')").all().map(c => c.name);
  if (!whCols.includes('priority')) {
    db.exec('ALTER TABLE warehouses ADD COLUMN priority INTEGER DEFAULT 1');
  }
  if (!whCols.includes('avg_delivery_days')) {
    db.exec('ALTER TABLE warehouses ADD COLUMN avg_delivery_days REAL DEFAULT 3.0');
  }
  if (!whCols.includes('base_shipping_cost')) {
    db.exec('ALTER TABLE warehouses ADD COLUMN base_shipping_cost REAL DEFAULT 50.0');
  }
  if (!whCols.includes('current_load')) {
    db.exec('ALTER TABLE warehouses ADD COLUMN current_load INTEGER DEFAULT 0');
  }
  if (!whCols.includes('max_capacity')) {
    db.exec('ALTER TABLE warehouses ADD COLUMN max_capacity INTEGER DEFAULT 1000');
  }

  // Add new routing_results columns if missing
  const rrCols = db.prepare("PRAGMA table_info('routing_results')").all().map(c => c.name);
  const newRRCols = [
    { name: 'routing_score', def: 'REAL DEFAULT 0' },
    { name: 'distance_score', def: 'REAL DEFAULT 0' },
    { name: 'inventory_score', def: 'REAL DEFAULT 0' },
    { name: 'load_score', def: 'REAL DEFAULT 0' },
    { name: 'speed_score', def: 'REAL DEFAULT 0' },
    { name: 'cost_score', def: 'REAL DEFAULT 0' },
  ];
  for (const col of newRRCols) {
    if (!rrCols.includes(col.name)) {
      db.exec(`ALTER TABLE routing_results ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

function updateWarehouseMeta() {
  // Set priority and metadata on existing warehouses
  const updates = [
    { id: 1, priority: 1, avg_delivery_days: 2.5, base_shipping_cost: 45, max_capacity: 1000 },
    { id: 2, priority: 2, avg_delivery_days: 3.0, base_shipping_cost: 50, max_capacity: 1200 },
    { id: 3, priority: 3, avg_delivery_days: 3.5, base_shipping_cost: 55, max_capacity: 800 },
    { id: 4, priority: 4, avg_delivery_days: 2.0, base_shipping_cost: 40, max_capacity: 1500 },
  ];
  const stmt = db.prepare('UPDATE warehouses SET priority = ?, avg_delivery_days = ?, base_shipping_cost = ?, max_capacity = ? WHERE id = ?');
  for (const u of updates) {
    stmt.run(u.priority, u.avg_delivery_days, u.base_shipping_cost, u.max_capacity, u.id);
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
