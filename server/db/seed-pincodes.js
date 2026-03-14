const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { getDb, closeDb } = require('./database');

const CSV_PATH = path.join(__dirname, 'pincode_data.csv');

function seedPincodes() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('Pin code CSV not found at:', CSV_PATH);
    console.log('Download from: https://data.gov.in/resource/all-india-pincode-directory');
    console.log('Or use the bundled sample data.');
    console.log('\nGenerating sample pin code data for development...');
    generateSampleData();
    return;
  }

  console.log('Reading pin code CSV...');
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  console.log(`Parsed ${records.length} records from CSV.`);

  const pincodeMap = new Map();

  for (const row of records) {
    const pincode = (row.pincode || row.Pincode || row.PINCODE || '').trim();
    const lat = parseFloat(row.Latitude || row.latitude || row.Lat || 0);
    const lng = parseFloat(row.Longitude || row.longitude || row.Long || row.Lng || 0);
    const officeName = row.officename || row.OfficeName || row.office_name || '';
    const district = row.Districtname || row.districtname || row.District || '';
    const state = row.statename || row.statename || row.State || '';

    if (!pincode || pincode.length !== 6) continue;
    if (isNaN(lat) || isNaN(lng)) continue;
    if (lat < 6 || lat > 38 || lng < 68 || lng > 98) continue;

    if (!pincodeMap.has(pincode)) {
      pincodeMap.set(pincode, { pincode, officeName, district, state, lats: [lat], lngs: [lng] });
    } else {
      pincodeMap.get(pincode).lats.push(lat);
      pincodeMap.get(pincode).lngs.push(lng);
    }
  }

  console.log(`Deduplicated to ${pincodeMap.size} unique pincodes.`);

  const db = getDb();

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO pincodes (pincode, office_name, district, state, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const [, data] of pincodeMap) {
      const avgLat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
      const avgLng = data.lngs.reduce((a, b) => a + b, 0) / data.lngs.length;
      stmt.run(data.pincode, data.officeName, data.district, data.state, avgLat, avgLng);
    }
  });

  insertAll();

  // Update warehouse coordinates from pincodes
  db.prepare(`
    UPDATE warehouses SET
      latitude = COALESCE((SELECT latitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode), warehouses.latitude),
      longitude = COALESCE((SELECT longitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode), warehouses.longitude)
  `).run();

  const count = db.prepare('SELECT COUNT(*) as count FROM pincodes').get();
  console.log(`Successfully seeded ${count.count} pincodes.`);

  closeDb();
}

function generateSampleData() {
  // Generate representative pin codes for all major Indian regions
  const samplePincodes = [
    // Warehouse pincodes (must exist)
    { pincode: '562123', office_name: 'Bangalore NLM', district: 'Bangalore Rural', state: 'Karnataka', latitude: 13.1986, longitude: 77.7066 },
    { pincode: '122413', office_name: 'Gurgaon', district: 'Gurgaon', state: 'Haryana', latitude: 28.4595, longitude: 77.0266 },
    { pincode: '711302', office_name: 'Howrah', district: 'Howrah', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
    { pincode: '421302', office_name: 'Bhiwandi', district: 'Thane', state: 'Maharashtra', latitude: 19.2813, longitude: 73.0483 },
    // Major cities
    { pincode: '110001', office_name: 'New Delhi GPO', district: 'Central Delhi', state: 'Delhi', latitude: 28.6328, longitude: 77.2197 },
    { pincode: '400001', office_name: 'Mumbai GPO', district: 'Mumbai', state: 'Maharashtra', latitude: 18.9398, longitude: 72.8355 },
    { pincode: '700001', office_name: 'Kolkata GPO', district: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
    { pincode: '600001', office_name: 'Chennai GPO', district: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
    { pincode: '560001', office_name: 'Bangalore GPO', district: 'Bangalore', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
    { pincode: '500001', office_name: 'Hyderabad GPO', district: 'Hyderabad', state: 'Telangana', latitude: 17.3850, longitude: 78.4867 },
    { pincode: '380001', office_name: 'Ahmedabad GPO', district: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
    { pincode: '411001', office_name: 'Pune GPO', district: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
    { pincode: '302001', office_name: 'Jaipur GPO', district: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
    { pincode: '226001', office_name: 'Lucknow GPO', district: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
    { pincode: '800001', office_name: 'Patna GPO', district: 'Patna', state: 'Bihar', latitude: 25.6093, longitude: 85.1376 },
    { pincode: '682001', office_name: 'Kochi GPO', district: 'Ernakulam', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
    { pincode: '440001', office_name: 'Nagpur GPO', district: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
    { pincode: '751001', office_name: 'Bhubaneswar GPO', district: 'Khordha', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
    { pincode: '160001', office_name: 'Chandigarh GPO', district: 'Chandigarh', state: 'Chandigarh', latitude: 30.7333, longitude: 76.7794 },
    { pincode: '452001', office_name: 'Indore GPO', district: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
    { pincode: '641001', office_name: 'Coimbatore GPO', district: 'Coimbatore', state: 'Tamil Nadu', latitude: 11.0168, longitude: 76.9558 },
    { pincode: '201301', office_name: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', latitude: 28.5355, longitude: 77.3910 },
    { pincode: '122001', office_name: 'Gurgaon HO', district: 'Gurgaon', state: 'Haryana', latitude: 28.4595, longitude: 77.0266 },
    { pincode: '560034', office_name: 'Bangalore South', district: 'Bangalore', state: 'Karnataka', latitude: 12.9352, longitude: 77.6245 },
    { pincode: '400070', office_name: 'Kurla', district: 'Mumbai Suburban', state: 'Maharashtra', latitude: 19.0728, longitude: 72.8826 },
    { pincode: '700091', office_name: 'Salt Lake', district: 'North 24 Parganas', state: 'West Bengal', latitude: 22.5800, longitude: 88.4200 },
    { pincode: '530001', office_name: 'Visakhapatnam GPO', district: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185 },
    { pincode: '360001', office_name: 'Rajkot GPO', district: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022 },
    { pincode: '110085', office_name: 'Delhi Cantt', district: 'South West Delhi', state: 'Delhi', latitude: 28.5800, longitude: 77.1200 },
    { pincode: '395001', office_name: 'Surat GPO', district: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  ];

  const db = getDb();

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO pincodes (pincode, office_name, district, state, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const p of samplePincodes) {
      stmt.run(p.pincode, p.office_name, p.district, p.state, p.latitude, p.longitude);
    }
  });

  insertAll();

  // Update warehouse coordinates
  db.prepare(`
    UPDATE warehouses SET
      latitude = COALESCE((SELECT latitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode), warehouses.latitude),
      longitude = COALESCE((SELECT longitude FROM pincodes WHERE pincodes.pincode = warehouses.pincode), warehouses.longitude)
  `).run();

  const count = db.prepare('SELECT COUNT(*) as count FROM pincodes').get();
  console.log(`Seeded ${count.count} sample pincodes for development.`);
  console.log('For production, download the full India Post pincode CSV.');

  closeDb();
}

seedPincodes();
