const { getDb, closeDb } = require('./database');

console.log('Initializing database...');
const db = getDb();

const pincodeCount = db.prepare('SELECT COUNT(*) as count FROM pincodes').get();
const warehouseCount = db.prepare('SELECT COUNT(*) as count FROM warehouses').get();

console.log(`Database initialized successfully.`);
console.log(`  Pincodes: ${pincodeCount.count}`);
console.log(`  Warehouses: ${warehouseCount.count}`);

const warehouses = db.prepare('SELECT * FROM warehouses').all();
console.log('\nWarehouses:');
warehouses.forEach(w => {
  console.log(`  ${w.id}. ${w.name} (${w.pincode}) - Lat: ${w.latitude}, Lng: ${w.longitude}`);
});

closeDb();
