-- Pin codes (India Post data)
CREATE TABLE IF NOT EXISTS pincodes (
    pincode TEXT PRIMARY KEY,
    office_name TEXT,
    district TEXT,
    state TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
);

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    pincode TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    priority INTEGER DEFAULT 1,
    avg_delivery_days REAL DEFAULT 3.0,
    base_shipping_cost REAL DEFAULT 50.0,
    current_load INTEGER DEFAULT 0,
    max_capacity INTEGER DEFAULT 1000
);

-- Orders (from EasyEcom)
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    easyecom_order_id TEXT UNIQUE NOT NULL,
    reference_code TEXT,
    order_date TEXT NOT NULL,
    shipping_pincode TEXT,
    marketplace TEXT,
    customer_name TEXT,
    company_name TEXT,
    total_weight_kg REAL DEFAULT 0,
    order_status_easyecom TEXT,
    raw_data TEXT,
    status TEXT DEFAULT 'pending',
    synced_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pincode ON orders(shipping_pincode);
CREATE INDEX IF NOT EXISTS idx_orders_refcode ON orders(reference_code);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    marketplace_sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    weight_per_unit_kg REAL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(marketplace_sku);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Inventory (from EasyEcom consolidated report)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    warehouse_id INTEGER,
    warehouse_name TEXT,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL,
    shelf_life_pct REAL NOT NULL,
    synced_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_sku_wh ON inventory(sku, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory(company_name);

-- Routing results
CREATE TABLE IF NOT EXISTS routing_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    assigned_warehouse_id INTEGER,
    assigned_quantity INTEGER NOT NULL,
    warehouse_rank INTEGER NOT NULL,
    distance_km REAL,
    routing_score REAL DEFAULT 0,
    distance_score REAL DEFAULT 0,
    inventory_score REAL DEFAULT 0,
    load_score REAL DEFAULT 0,
    speed_score REAL DEFAULT 0,
    cost_score REAL DEFAULT 0,
    is_split INTEGER DEFAULT 0,
    failure_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id),
    FOREIGN KEY (assigned_warehouse_id) REFERENCES warehouses(id)
);
CREATE INDEX IF NOT EXISTS idx_routing_order ON routing_results(order_id);
CREATE INDEX IF NOT EXISTS idx_routing_warehouse ON routing_results(assigned_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_routing_failure ON routing_results(failure_reason);

-- Heavy orders (>20kg)
CREATE TABLE IF NOT EXISTS heavy_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    total_weight_kg REAL NOT NULL,
    flagged_at TEXT DEFAULT (datetime('now')),
    exported INTEGER DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Pin code errors
CREATE TABLE IF NOT EXISTS pincode_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    shipping_pincode TEXT,
    error_type TEXT NOT NULL,
    suggested_correction TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Email log
CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'sent'
);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    records_fetched INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running'
);

-- SKU weights (fallback for weight data)
CREATE TABLE IF NOT EXISTS sku_weights (
    sku TEXT PRIMARY KEY,
    weight_kg REAL NOT NULL
);
