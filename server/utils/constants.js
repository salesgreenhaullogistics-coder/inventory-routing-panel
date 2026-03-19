const WAREHOUSES = [
  { id: 1, name: 'Emiza Bangalore NLM', pincode: '562123' },
  { id: 2, name: 'Prozo GGN 05', pincode: '122413' },
  { id: 3, name: 'Emiza Kolkata', pincode: '711302' },
  { id: 4, name: 'Prozo Bhiwandi D2C', pincode: '421302' },
];

const ROUTING_CONFIG = {
  MIN_SHELF_LIFE_PCT: 60,
  REQUIRED_STATUS: 'Available',
  HEAVY_ORDER_THRESHOLD_KG: 20,
};

// Multi-factor scoring weights (6 factors with RTO)
const SCORING_WEIGHTS = {
  DISTANCE: 0.35,
  INVENTORY: 0.25,
  LOAD: 0.15,
  SPEED: 0.10,
  COST: 0.05,
  RTO: 0.10,
};

// Inventory health thresholds
const INVENTORY_HEALTH = {
  HEALTHY_MIN: 60,    // >= 60% = Healthy
  WARNING_MIN: 30,    // 30-60% = Warning
  CRITICAL_MAX: 30,   // < 30% = Critical
};

const FAILURE_REASONS = {
  NO_INVENTORY: 'No Inventory',
  LOW_SHELF_LIFE: 'Low Shelf Life',
  SKU_NOT_FOUND: 'SKU Not Found',
  SKU_MISSING: 'SKU Missing',
  LOCATION_MISMATCH: 'Location Mismatch',
  INVALID_PINCODE: 'Invalid Pincode',
  MISSING_PINCODE: 'Missing Pincode',
  API_ERROR: 'API Error',
  NO_SERVICEABLE_WAREHOUSE: 'No Serviceable Warehouse',
};

const WAREHOUSE_EMAILS = {
  1: 'bangalore@warehouse.com',
  2: 'gurgaon@warehouse.com',
  3: 'kolkata@warehouse.com',
  4: 'bhiwandi@warehouse.com',
};

// Only these marketplaces are considered for routing and inventory management
const ALLOWED_MARKETPLACES = ['Shopify', 'Anveshan - OTS'];

module.exports = { WAREHOUSES, ROUTING_CONFIG, SCORING_WEIGHTS, INVENTORY_HEALTH, FAILURE_REASONS, WAREHOUSE_EMAILS, ALLOWED_MARKETPLACES };
