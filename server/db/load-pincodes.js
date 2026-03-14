const { getDb } = require('./database');

// Pincode prefix to approximate lat/lon mapping for India
const PINCODE_PREFIX_COORDS = {
  '11': [28.65, 77.20], '12': [28.46, 76.90], '13': [30.73, 76.78],
  '14': [31.10, 75.34], '15': [32.10, 77.17], '16': [30.74, 76.79],
  '17': [31.10, 77.17], '18': [34.08, 74.80], '19': [34.08, 74.80],
  '20': [26.85, 80.95], '21': [26.85, 80.95], '22': [26.45, 80.35],
  '23': [25.44, 81.85], '24': [27.18, 79.00], '25': [28.67, 77.40],
  '26': [29.97, 78.07], '27': [26.85, 81.00], '28': [27.18, 78.02],
  '30': [26.91, 75.79], '31': [28.02, 73.31], '32': [27.20, 77.50],
  '33': [25.50, 72.00], '34': [26.30, 73.02], '36': [22.30, 70.80],
  '37': [23.02, 72.57], '38': [21.17, 72.83], '39': [22.31, 73.18],
  '40': [19.08, 72.88], '41': [18.52, 73.86], '42': [19.28, 73.05],
  '43': [20.93, 77.75], '44': [21.15, 79.09], '45': [22.72, 75.86],
  '46': [23.26, 77.41], '47': [26.22, 78.18], '48': [22.97, 78.66],
  '49': [21.25, 81.63], '50': [17.39, 78.49], '51': [15.83, 78.05],
  '52': [16.51, 80.63], '53': [17.69, 83.22], '56': [12.97, 77.59],
  '57': [15.35, 75.12], '58': [15.36, 75.12], '59': [15.85, 74.50],
  '60': [13.08, 80.27], '61': [10.79, 79.14], '62': [9.93, 78.12],
  '63': [11.00, 76.97], '64': [11.02, 76.99], '67': [11.25, 75.77],
  '68': [9.93, 76.26], '69': [8.52, 76.94], '70': [22.57, 88.36],
  '71': [22.57, 88.36], '72': [22.90, 88.40], '73': [23.50, 87.30],
  '74': [26.72, 88.43], '75': [20.30, 85.82], '76': [20.27, 85.84],
  '77': [25.61, 85.14], '78': [26.18, 91.75], '79': [23.83, 91.28],
  '80': [25.62, 85.12], '81': [23.35, 85.33], '82': [23.61, 85.28],
  '83': [24.79, 85.00], '84': [26.12, 85.39], '85': [26.12, 86.21],
  '10': [28.65, 77.10], '29': [27.00, 78.50], '35': [23.00, 72.50],
  '54': [16.00, 80.00], '55': [14.00, 77.00], '65': [11.50, 78.00],
  '66': [12.00, 76.00], '86': [25.80, 87.00], '87': [26.00, 87.50],
  '88': [27.00, 88.00], '89': [27.50, 88.50], '90': [11.00, 76.00],
};

const DEFAULT_COORDS = [22.5, 78.5];

function estimateCoords(pincode) {
  const prefix2 = pincode.substring(0, 2);
  if (PINCODE_PREFIX_COORDS[prefix2]) {
    const [lat, lon] = PINCODE_PREFIX_COORDS[prefix2];
    const suffix = parseInt(pincode.substring(2)) || 0;
    const latOffset = ((suffix % 100) - 50) * 0.01;
    const lonOffset = ((Math.floor(suffix / 100) % 100) - 50) * 0.01;
    return [lat + latOffset, lon + lonOffset];
  }
  return DEFAULT_COORDS;
}

function loadPincodes() {
  const db = getDb();

  // Get all unique pincodes from orders
  const orderPincodes = db.prepare(
    "SELECT DISTINCT shipping_pincode FROM orders WHERE shipping_pincode IS NOT NULL AND shipping_pincode != ''"
  ).all().map(r => r.shipping_pincode);

  // Warehouse pincodes
  const whPincodes = ['562123', '122413', '711302', '421302'];
  const allPincodes = [...new Set([...orderPincodes, ...whPincodes])];

  console.log('Total unique pincodes to load:', allPincodes.length);

  const stmt = db.prepare(
    'INSERT OR REPLACE INTO pincodes (pincode, office_name, district, state, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
  );

  let loaded = 0;
  const insertAll = db.transaction(() => {
    for (const pin of allPincodes) {
      if (!pin || !/^\d{6}$/.test(pin)) continue;
      const [lat, lon] = estimateCoords(pin);
      stmt.run(pin, '', '', '', lat, lon);
      loaded++;
    }
  });

  insertAll();
  console.log('Loaded pincodes:', loaded);

  // Verify
  const count = db.prepare('SELECT COUNT(*) as c FROM pincodes').get();
  console.log('Total pincodes in DB:', count.c);

  const whCheck = db.prepare("SELECT pincode, latitude, longitude FROM pincodes WHERE pincode IN ('562123','122413','711302','421302')").all();
  console.log('Warehouse pincodes:', whCheck);
}

loadPincodes();
