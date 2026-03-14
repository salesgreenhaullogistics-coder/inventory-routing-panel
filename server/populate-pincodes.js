/**
 * populate-pincodes.js
 * Reads distinct shipping_pincode values from orders table,
 * generates approximate lat/long based on first-2-digit zone mapping,
 * and inserts missing pincodes into the pincodes table.
 */

const Database = require('./node_modules/better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'db', 'inventory.db'));

// Comprehensive mapping of first-2-digit pincode prefixes to approximate coordinates.
// Based on India Post zone/sub-zone structure.
const PREFIX_MAP = {
  // Zone 1 - Delhi / UP (West) / Uttarakhand / HP / J&K
  '10': { lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'New Delhi' },
  '11': { lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'Delhi' },
  '12': { lat: 28.4595, lng: 77.0266, state: 'Haryana', district: 'Gurugram' },
  '13': { lat: 30.7333, lng: 76.7794, state: 'Punjab', district: 'Patiala' },
  '14': { lat: 31.1471, lng: 75.3415, state: 'Punjab', district: 'Ludhiana' },
  '15': { lat: 31.6340, lng: 74.8723, state: 'Punjab', district: 'Amritsar' },
  '16': { lat: 30.9010, lng: 75.8573, state: 'Punjab', district: 'Jalandhar' },
  '17': { lat: 31.1048, lng: 77.1734, state: 'Himachal Pradesh', district: 'Shimla' },
  '18': { lat: 32.7266, lng: 74.8570, state: 'Jammu & Kashmir', district: 'Jammu' },
  '19': { lat: 34.0837, lng: 74.7973, state: 'Jammu & Kashmir', district: 'Srinagar' },

  // Zone 2 - Haryana / Rajasthan (North) / UP (West)
  '20': { lat: 28.2006, lng: 79.9760, state: 'Uttar Pradesh', district: 'Agra' },
  '21': { lat: 28.5355, lng: 77.3910, state: 'Uttar Pradesh', district: 'Noida' },
  '22': { lat: 26.8467, lng: 80.9462, state: 'Uttar Pradesh', district: 'Lucknow' },
  '23': { lat: 25.3176, lng: 82.9739, state: 'Uttar Pradesh', district: 'Varanasi' },
  '24': { lat: 28.9845, lng: 77.7064, state: 'Uttar Pradesh', district: 'Meerut' },
  '25': { lat: 25.4358, lng: 81.8463, state: 'Uttar Pradesh', district: 'Allahabad' },
  '26': { lat: 26.4499, lng: 80.3319, state: 'Uttar Pradesh', district: 'Kanpur' },
  '27': { lat: 27.5706, lng: 80.0982, state: 'Uttar Pradesh', district: 'Shahjahanpur' },
  '28': { lat: 27.1767, lng: 78.0081, state: 'Uttar Pradesh', district: 'Agra' },
  '29': { lat: 29.9457, lng: 78.1642, state: 'Uttarakhand', district: 'Dehradun' },

  // Zone 3 - Rajasthan / Gujarat
  '30': { lat: 26.9124, lng: 75.7873, state: 'Rajasthan', district: 'Jaipur' },
  '31': { lat: 26.9124, lng: 75.7873, state: 'Rajasthan', district: 'Jaipur' },
  '32': { lat: 26.4499, lng: 74.6399, state: 'Rajasthan', district: 'Ajmer' },
  '33': { lat: 24.5854, lng: 73.7125, state: 'Rajasthan', district: 'Udaipur' },
  '34': { lat: 25.2138, lng: 75.8648, state: 'Rajasthan', district: 'Kota' },
  '35': { lat: 27.2038, lng: 73.0243, state: 'Rajasthan', district: 'Bikaner' },
  '36': { lat: 23.0225, lng: 72.5714, state: 'Gujarat', district: 'Ahmedabad' },
  '37': { lat: 22.3072, lng: 73.1812, state: 'Gujarat', district: 'Vadodara' },
  '38': { lat: 21.1702, lng: 72.8311, state: 'Gujarat', district: 'Surat' },
  '39': { lat: 22.2587, lng: 71.1924, state: 'Gujarat', district: 'Rajkot' },

  // Zone 4 - Maharashtra / Goa / MP / Chhattisgarh
  '40': { lat: 19.0760, lng: 72.8777, state: 'Maharashtra', district: 'Mumbai' },
  '41': { lat: 18.5204, lng: 73.8567, state: 'Maharashtra', district: 'Pune' },
  '42': { lat: 21.1458, lng: 79.0882, state: 'Maharashtra', district: 'Nagpur' },
  '43': { lat: 19.8762, lng: 75.3433, state: 'Maharashtra', district: 'Aurangabad' },
  '44': { lat: 21.1458, lng: 79.0882, state: 'Maharashtra', district: 'Nagpur' },
  '45': { lat: 23.1765, lng: 77.4151, state: 'Madhya Pradesh', district: 'Bhopal' },
  '46': { lat: 22.7196, lng: 75.8577, state: 'Madhya Pradesh', district: 'Indore' },
  '47': { lat: 23.8388, lng: 78.7378, state: 'Madhya Pradesh', district: 'Sagar' },
  '48': { lat: 21.2449, lng: 81.6296, state: 'Chhattisgarh', district: 'Raipur' },
  '49': { lat: 15.4909, lng: 73.8278, state: 'Goa', district: 'Panaji' },

  // Zone 5 - Andhra Pradesh / Telangana / Karnataka
  '50': { lat: 17.3850, lng: 78.4867, state: 'Telangana', district: 'Hyderabad' },
  '51': { lat: 17.9689, lng: 79.5941, state: 'Telangana', district: 'Warangal' },
  '52': { lat: 17.6868, lng: 83.2185, state: 'Andhra Pradesh', district: 'Visakhapatnam' },
  '53': { lat: 16.5062, lng: 80.6480, state: 'Andhra Pradesh', district: 'Vijayawada' },
  '54': { lat: 14.4673, lng: 78.8242, state: 'Andhra Pradesh', district: 'Kurnool' },
  '55': { lat: 13.6288, lng: 79.4192, state: 'Andhra Pradesh', district: 'Tirupati' },
  '56': { lat: 12.9716, lng: 77.5946, state: 'Karnataka', district: 'Bengaluru' },
  '57': { lat: 15.3647, lng: 75.1240, state: 'Karnataka', district: 'Dharwad' },
  '58': { lat: 12.2958, lng: 76.6394, state: 'Karnataka', district: 'Mysuru' },
  '59': { lat: 13.3379, lng: 77.1173, state: 'Karnataka', district: 'Tumkur' },

  // Zone 6 - Tamil Nadu / Kerala / Puducherry
  '60': { lat: 13.0827, lng: 80.2707, state: 'Tamil Nadu', district: 'Chennai' },
  '61': { lat: 10.7905, lng: 78.7047, state: 'Tamil Nadu', district: 'Tiruchirappalli' },
  '62': { lat: 9.9252, lng: 78.1198, state: 'Tamil Nadu', district: 'Madurai' },
  '63': { lat: 11.6643, lng: 78.1460, state: 'Tamil Nadu', district: 'Salem' },
  '64': { lat: 11.0168, lng: 76.9558, state: 'Tamil Nadu', district: 'Coimbatore' },
  '65': { lat: 8.5241, lng: 76.9366, state: 'Kerala', district: 'Thiruvananthapuram' },
  '66': { lat: 9.9312, lng: 76.2673, state: 'Kerala', district: 'Kochi' },
  '67': { lat: 11.2588, lng: 75.7804, state: 'Kerala', district: 'Kozhikode' },
  '68': { lat: 10.5276, lng: 76.2144, state: 'Kerala', district: 'Thrissur' },
  '69': { lat: 11.8745, lng: 75.3704, state: 'Kerala', district: 'Kannur' },

  // Zone 7 - West Bengal / Odisha / NE States / Andaman
  '70': { lat: 22.5726, lng: 88.3639, state: 'West Bengal', district: 'Kolkata' },
  '71': { lat: 22.5726, lng: 88.3639, state: 'West Bengal', district: 'Kolkata' },
  '72': { lat: 23.5204, lng: 87.3119, state: 'West Bengal', district: 'Bankura' },
  '73': { lat: 23.1793, lng: 88.4342, state: 'West Bengal', district: 'Nadia' },
  '74': { lat: 26.7271, lng: 88.3952, state: 'West Bengal', district: 'Siliguri' },
  '75': { lat: 20.2961, lng: 85.8245, state: 'Odisha', district: 'Bhubaneswar' },
  '76': { lat: 21.4669, lng: 83.9812, state: 'Odisha', district: 'Rourkela' },
  '77': { lat: 26.1445, lng: 91.7362, state: 'Assam', district: 'Guwahati' },
  '78': { lat: 25.5788, lng: 91.8933, state: 'Meghalaya', district: 'Shillong' },
  '79': { lat: 27.1004, lng: 93.6167, state: 'Arunachal Pradesh', district: 'Itanagar' },

  // Zone 8 - Bihar / Jharkhand / UP (East)
  '80': { lat: 25.5941, lng: 85.1376, state: 'Bihar', district: 'Patna' },
  '81': { lat: 24.7914, lng: 85.0002, state: 'Bihar', district: 'Gaya' },
  '82': { lat: 24.1490, lng: 86.1525, state: 'Jharkhand', district: 'Dhanbad' },
  '83': { lat: 23.3441, lng: 85.3096, state: 'Jharkhand', district: 'Ranchi' },
  '84': { lat: 25.7476, lng: 87.4677, state: 'Bihar', district: 'Bhagalpur' },
  '85': { lat: 26.1197, lng: 85.3910, state: 'Bihar', district: 'Muzaffarpur' },
  '86': { lat: 26.6656, lng: 88.4299, state: 'West Bengal', district: 'Cooch Behar' },
  '87': { lat: 23.1765, lng: 85.3096, state: 'Jharkhand', district: 'Bokaro' },
  '88': { lat: 27.5330, lng: 88.5122, state: 'Sikkim', district: 'Gangtok' },
  '89': { lat: 25.3176, lng: 82.9739, state: 'Uttar Pradesh', district: 'Varanasi' },

  // Zone 9 - Special / Remaining
  '90': { lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'Delhi' },
  '91': { lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'Delhi' },
  '92': { lat: 34.0837, lng: 74.7973, state: 'Jammu & Kashmir', district: 'Srinagar' },
  '93': { lat: 25.4670, lng: 91.3662, state: 'Meghalaya', district: 'Tura' },
  '94': { lat: 24.8170, lng: 92.7173, state: 'Manipur', district: 'Imphal' },
  '95': { lat: 23.7271, lng: 92.7176, state: 'Mizoram', district: 'Aizawl' },
  '96': { lat: 25.6747, lng: 94.1086, state: 'Nagaland', district: 'Kohima' },
  '97': { lat: 11.6234, lng: 92.7265, state: 'Andaman & Nicobar Islands', district: 'Port Blair' },
  '98': { lat: 11.6234, lng: 92.7265, state: 'Andaman & Nicobar Islands', district: 'Port Blair' },
  '99': { lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'Delhi' },
};

// Fallback coordinates if prefix not found
const FALLBACK = { lat: 20.5937, lng: 78.9629, state: 'India', district: 'Unknown' };

function getCoords(pincode) {
  const prefix = String(pincode).substring(0, 2);
  return PREFIX_MAP[prefix] || FALLBACK;
}

// Add small deterministic jitter based on full pincode so nearby pincodes
// don't all land on the exact same point. Max ~0.3 degrees (~33 km).
function jitter(pincode, base) {
  const n = parseInt(pincode, 10);
  const latOffset = ((n % 97) / 97 - 0.5) * 0.6;
  const lngOffset = ((n % 83) / 83 - 0.5) * 0.6;
  return {
    lat: parseFloat((base.lat + latOffset).toFixed(6)),
    lng: parseFloat((base.lng + lngOffset).toFixed(6)),
  };
}

// --- Main ---
const allPincodes = db.prepare(
  'SELECT DISTINCT shipping_pincode FROM orders WHERE shipping_pincode IS NOT NULL AND shipping_pincode != \'\''
).all().map(r => r.shipping_pincode);

console.log(`Total distinct pincodes in orders: ${allPincodes.length}`);

const existing = new Set(
  db.prepare('SELECT pincode FROM pincodes').all().map(r => r.pincode)
);

console.log(`Already in pincodes table: ${existing.size}`);

const missing = allPincodes.filter(p => !existing.has(String(p)));
console.log(`Need to insert: ${missing.length}`);

if (missing.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

const insert = db.prepare(
  'INSERT OR IGNORE INTO pincodes (pincode, office_name, district, state, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
);

const insertMany = db.transaction((pincodes) => {
  let inserted = 0;
  for (const pincode of pincodes) {
    const base = getCoords(pincode);
    const { lat, lng } = jitter(pincode, base);
    const officeName = `${base.district} PO`;
    const result = insert.run(
      String(pincode),
      officeName,
      base.district,
      base.state,
      lat,
      lng
    );
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

const inserted = insertMany(missing);
console.log(`Successfully inserted ${inserted} pincodes.`);

const total = db.prepare('SELECT COUNT(*) as c FROM pincodes').get();
console.log(`Total pincodes in table now: ${total.c}`);

db.close();
