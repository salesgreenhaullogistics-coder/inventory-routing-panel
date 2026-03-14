const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { toCSV, toExcelBuffer } = require('../utils/csvExport');
const easyecomApi = require('../services/easyecomApi');
const { ALLOWED_MARKETPLACES } = require('../utils/constants');

const MP_FILTER = `o.marketplace IN (${ALLOWED_MARKETPLACES.map(() => '?').join(',')})`;
const MP_PARAMS = [...ALLOWED_MARKETPLACES];

const RAW_DATA_COLUMNS = easyecomApi.RAW_DATA_COLUMNS;

// Helper: build full raw data export rows with Reference Code as Column A
function buildFullExportRows(orders, extraColumns = {}) {
  const exportRows = [];
  for (const order of orders) {
    try {
      const rawRows = JSON.parse(order.raw_data || '[]');
      const rows = rawRows.length > 0 ? rawRows : [{}];
      for (const row of rows) {
        const exportRow = { 'Reference Code': row['Reference Code'] || order.reference_code || '' };
        for (const col of RAW_DATA_COLUMNS) {
          if (col === 'Reference Code') continue;
          exportRow[col] = row[col] !== undefined ? row[col] : '';
        }
        for (const [k, v] of Object.entries(extraColumns)) {
          exportRow[k] = typeof v === 'function' ? v(order) : (order[v] || '');
        }
        exportRows.push(exportRow);
      }
    } catch (e) {
      const exportRow = { 'Reference Code': order.reference_code || '' };
      for (const col of RAW_DATA_COLUMNS) {
        if (col === 'Reference Code') continue;
        exportRow[col] = '';
      }
      for (const [k, v] of Object.entries(extraColumns)) {
        exportRow[k] = typeof v === 'function' ? v(order) : (order[v] || '');
      }
      exportRows.push(exportRow);
    }
  }
  return exportRows;
}

function getOrderedColumns(extraCols = []) {
  return ['Reference Code', ...RAW_DATA_COLUMNS.filter(c => c !== 'Reference Code'), ...extraCols];
}

function sendExport(res, exportRows, format, filename, sheetName, extraCols = []) {
  const orderedCols = getOrderedColumns(extraCols);
  if (format === 'xlsx') {
    const ordered = exportRows.map(row => {
      const o = {};
      for (const col of orderedCols) o[col] = row[col] !== undefined ? row[col] : '';
      return o;
    });
    const buffer = toExcelBuffer(ordered, sheetName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } else {
    const csv = toCSV(exportRows, orderedCols);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(csv);
  }
}

// GET /api/exports/orders — Full dump with location filter, Reference Code first
router.get('/orders', (req, res) => {
  const db = getDb();
  const { format = 'csv', warehouseId, status } = req.query;

  let whWhere = '';
  const whParams = [];
  if (warehouseId) {
    whWhere = ' AND o.id IN (SELECT DISTINCT order_id FROM routing_results WHERE assigned_warehouse_id = ? AND failure_reason IS NULL)';
    whParams.push(parseInt(warehouseId));
  }
  let statusWhere = '';
  const statusParams = [];
  if (status) { statusWhere = ' AND o.status = ?'; statusParams.push(status); }

  const orders = db.prepare(`
    SELECT o.reference_code, o.raw_data, o.status, o.easyecom_order_id
    FROM orders o WHERE ${MP_FILTER} ${whWhere} ${statusWhere}
    ORDER BY o.order_date DESC
  `).all(...MP_PARAMS, ...whParams, ...statusParams);

  const extraCols = {
    'Routing Status': (o) => o.status,
    'Assigned Warehouse': (o) => {
      const wh = db.prepare(`SELECT w.name FROM routing_results r JOIN warehouses w ON w.id=r.assigned_warehouse_id WHERE r.order_id=(SELECT id FROM orders WHERE easyecom_order_id=?) AND r.failure_reason IS NULL LIMIT 1`).get(o.easyecom_order_id);
      return wh?.name || '';
    },
    'Routing Score': (o) => {
      const s = db.prepare(`SELECT r.routing_score FROM routing_results r WHERE r.order_id=(SELECT id FROM orders WHERE easyecom_order_id=?) AND r.failure_reason IS NULL LIMIT 1`).get(o.easyecom_order_id);
      return s?.routing_score || '';
    },
  };

  const exportRows = buildFullExportRows(orders, extraCols);
  sendExport(res, exportRows, format, 'orders_full', 'Orders', ['Routing Status', 'Assigned Warehouse', 'Routing Score']);
});

// GET /api/exports/failed-orders
router.get('/failed-orders', (req, res) => {
  const db = getDb();
  const { format = 'csv' } = req.query;

  const failedOrders = db.prepare(`
    SELECT o.reference_code, o.raw_data, o.status,
           GROUP_CONCAT(DISTINCT r.failure_reason) as failure_reasons
    FROM orders o
    LEFT JOIN routing_results r ON r.order_id = o.id AND r.failure_reason IS NOT NULL
    WHERE o.status = 'failed' AND ${MP_FILTER}
    GROUP BY o.id ORDER BY o.order_date DESC
  `).all(...MP_PARAMS);

  const extraCols = {
    'Routing Status': (o) => o.status,
    'Failure Reason': (o) => o.failure_reasons || '',
  };

  const exportRows = buildFullExportRows(failedOrders, extraCols);
  sendExport(res, exportRows, format, 'failed_orders_full', 'Failed Orders', ['Routing Status', 'Failure Reason']);
});

// GET /api/exports/routing — with location filter + scoring
router.get('/routing', (req, res) => {
  const db = getDb();
  const { format = 'csv', warehouseId } = req.query;

  let whWhere = '';
  const whParams = [];
  if (warehouseId) { whWhere = ' AND r.assigned_warehouse_id = ?'; whParams.push(parseInt(warehouseId)); }

  const data = db.prepare(`
    SELECT o.reference_code, o.easyecom_order_id, o.order_date, o.shipping_pincode,
           o.marketplace, o.customer_name, oi.marketplace_sku, oi.quantity as item_qty,
           r.assigned_quantity, r.warehouse_rank, r.distance_km,
           r.routing_score, r.distance_score, r.inventory_score,
           r.load_score, r.speed_score, r.cost_score,
           r.is_split, r.failure_reason, w.name as warehouse
    FROM routing_results r
    JOIN orders o ON o.id = r.order_id
    JOIN order_items oi ON oi.id = r.order_item_id
    LEFT JOIN warehouses w ON w.id = r.assigned_warehouse_id
    WHERE 1=1 ${whWhere}
    ORDER BY o.reference_code, r.created_at DESC
  `).all(...whParams);

  const exportRows = data.map(row => ({
    'Reference Code': row.reference_code,
    'EasyEcom Order ID': row.easyecom_order_id,
    'Order Date': row.order_date,
    'Pincode': row.shipping_pincode,
    'Marketplace': row.marketplace,
    'Customer': row.customer_name,
    'SKU': row.marketplace_sku,
    'Item Qty': row.item_qty,
    'Assigned Qty': row.assigned_quantity,
    'Warehouse': row.warehouse || '',
    'Rank': row.warehouse_rank,
    'Distance (km)': row.distance_km ? row.distance_km.toFixed(1) : '',
    'Routing Score': row.routing_score || '',
    'Dist Score': row.distance_score || '',
    'Inv Score': row.inventory_score || '',
    'Load Score': row.load_score || '',
    'Speed Score': row.speed_score || '',
    'Cost Score': row.cost_score || '',
    'Split': row.is_split ? 'Yes' : 'No',
    'Failure': row.failure_reason || '',
  }));

  if (format === 'xlsx') {
    const buffer = toExcelBuffer(exportRows, 'Routing');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="routing_results.xlsx"');
    res.send(buffer);
  } else {
    const csv = toCSV(exportRows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="routing_results.csv"');
    res.send(csv);
  }
});

// GET /api/exports/errors
router.get('/errors', (req, res) => {
  const db = getDb();
  const { format = 'csv' } = req.query;
  const data = db.prepare(`
    SELECT o.reference_code, pe.shipping_pincode, pe.error_type, pe.suggested_correction,
           o.easyecom_order_id, o.order_date, o.customer_name, o.marketplace
    FROM pincode_errors pe JOIN orders o ON o.id = pe.order_id
    ORDER BY pe.created_at DESC
  `).all();
  const rows = data.map(r => ({ 'Reference Code': r.reference_code, 'Order ID': r.easyecom_order_id, 'Date': r.order_date, 'Customer': r.customer_name, 'Marketplace': r.marketplace, 'Pincode': r.shipping_pincode, 'Error': r.error_type, 'Suggested': r.suggested_correction || '' }));
  if (format === 'xlsx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename="errors.xlsx"'); res.send(toExcelBuffer(rows, 'Errors')); }
  else { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="errors.csv"'); res.send(toCSV(rows)); }
});

// GET /api/exports/heavy-orders
router.get('/heavy-orders', (req, res) => {
  const db = getDb();
  const { format = 'csv', warehouseId } = req.query;

  let whWhere = '';
  const whParams = [];
  if (warehouseId) { whWhere = ' AND r.assigned_warehouse_id = ?'; whParams.push(parseInt(warehouseId)); }

  const heavyOrders = db.prepare(`
    SELECT o.reference_code, o.raw_data, o.status, h.total_weight_kg, o.easyecom_order_id
    FROM heavy_orders h
    JOIN orders o ON o.id = h.order_id
    LEFT JOIN routing_results r ON r.order_id = o.id AND r.failure_reason IS NULL
    WHERE ${MP_FILTER} ${whWhere}
    GROUP BY o.id ORDER BY h.flagged_at DESC
  `).all(...MP_PARAMS, ...whParams);

  const extraCols = {
    'Routing Status': (o) => o.status,
    'Total Weight (kg)': (o) => o.total_weight_kg || '',
    'Assigned Warehouse': (o) => {
      const wh = db.prepare(`SELECT w.name FROM routing_results r JOIN warehouses w ON w.id=r.assigned_warehouse_id WHERE r.order_id=(SELECT id FROM orders WHERE easyecom_order_id=?) AND r.failure_reason IS NULL LIMIT 1`).get(o.easyecom_order_id);
      return wh?.name || '';
    },
  };

  const exportRows = buildFullExportRows(heavyOrders, extraCols);
  sendExport(res, exportRows, format, 'heavy_orders_full', 'Heavy Orders', ['Routing Status', 'Total Weight (kg)', 'Assigned Warehouse']);
});

module.exports = router;
