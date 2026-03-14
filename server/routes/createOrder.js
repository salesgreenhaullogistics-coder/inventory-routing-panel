const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const easyecomApi = require('../services/easyecomApi');

// POST /api/create-order/:orderId
// Manually create an order at the assigned warehouse(s) in EasyEcom
router.post('/:orderId', async (req, res, next) => {
  try {
    const db = getDb();
    const orderId = parseInt(req.params.orderId);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Get routing results (successful allocations only)
    const allocations = db.prepare(`
      SELECT r.*, w.name as warehouse_name, oi.marketplace_sku, oi.quantity as item_quantity
      FROM routing_results r
      JOIN warehouses w ON w.id = r.assigned_warehouse_id
      JOIN order_items oi ON oi.id = r.order_item_id
      WHERE r.order_id = ? AND r.failure_reason IS NULL AND r.assigned_warehouse_id IS NOT NULL
      ORDER BY r.assigned_warehouse_id
    `).all(orderId);

    if (allocations.length === 0) {
      return res.status(400).json({
        error: 'No successful routing allocations found for this order. Route the order first.',
      });
    }

    // Group allocations by warehouse
    const warehouseGroups = {};
    for (const alloc of allocations) {
      const whId = alloc.assigned_warehouse_id;
      if (!warehouseGroups[whId]) {
        warehouseGroups[whId] = {
          warehouseId: whId,
          warehouseName: alloc.warehouse_name,
          items: [],
        };
      }
      warehouseGroups[whId].items.push({
        sku: alloc.marketplace_sku,
        allocatedQty: alloc.assigned_quantity,
      });
    }

    const results = [];

    // Create an order at each warehouse
    for (const [whId, group] of Object.entries(warehouseGroups)) {
      const payload = easyecomApi.buildCreateOrderPayload(
        order,
        null,
        group.items.map(item => ({
          warehouseId: parseInt(whId),
          warehouseName: group.warehouseName,
          allocatedQty: item.allocatedQty,
          sku: item.sku,
        }))
      );

      try {
        const result = await easyecomApi.createOrder(payload);
        results.push({
          warehouseId: parseInt(whId),
          warehouseName: group.warehouseName,
          success: true,
          easyecomOrderId: result.orderId,
          invoiceId: result.invoiceId,
          message: result.message,
        });
      } catch (err) {
        results.push({
          warehouseId: parseInt(whId),
          warehouseName: group.warehouseName,
          success: false,
          error: err.message,
        });
      }
    }

    // Update order status
    const allSuccess = results.every(r => r.success);
    if (allSuccess) {
      db.prepare("UPDATE orders SET status = 'created', processed_at = datetime('now') WHERE id = ?").run(orderId);
    }

    // Log the creation results
    const createdIds = results.filter(r => r.success).map(r => r.easyecomOrderId).join(', ');
    if (createdIds) {
      console.log(`[CreateOrder] Order ${order.easyecom_order_id} created in EasyEcom: ${createdIds}`);
    }

    res.json({
      orderId,
      easyecomOrderId: order.easyecom_order_id,
      results,
      allSuccess,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/create-order/bulk
// Create orders for multiple routed orders at once (manual trigger)
router.post('/', async (req, res, next) => {
  try {
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Provide an array of orderIds in the request body' });
    }

    const results = [];
    for (const id of orderIds) {
      try {
        // Reuse the single order creation logic
        const db = getDb();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) {
          results.push({ orderId: id, success: false, error: 'Order not found' });
          continue;
        }

        const allocations = db.prepare(`
          SELECT r.*, w.name as warehouse_name, oi.marketplace_sku
          FROM routing_results r
          JOIN warehouses w ON w.id = r.assigned_warehouse_id
          JOIN order_items oi ON oi.id = r.order_item_id
          WHERE r.order_id = ? AND r.failure_reason IS NULL AND r.assigned_warehouse_id IS NOT NULL
        `).all(id);

        if (allocations.length === 0) {
          results.push({ orderId: id, success: false, error: 'No routing allocations' });
          continue;
        }

        // Build warehouse groups
        const warehouseGroups = {};
        for (const alloc of allocations) {
          const whId = alloc.assigned_warehouse_id;
          if (!warehouseGroups[whId]) {
            warehouseGroups[whId] = { warehouseId: whId, warehouseName: alloc.warehouse_name, items: [] };
          }
          warehouseGroups[whId].items.push({ sku: alloc.marketplace_sku, allocatedQty: alloc.assigned_quantity });
        }

        let allSuccess = true;
        for (const [whId, group] of Object.entries(warehouseGroups)) {
          const payload = easyecomApi.buildCreateOrderPayload(
            order, null,
            group.items.map(item => ({
              warehouseId: parseInt(whId), warehouseName: group.warehouseName,
              allocatedQty: item.allocatedQty, sku: item.sku,
            }))
          );
          try {
            await easyecomApi.createOrder(payload);
          } catch {
            allSuccess = false;
          }
        }

        if (allSuccess) {
          db.prepare("UPDATE orders SET status = 'created', processed_at = datetime('now') WHERE id = ?").run(id);
        }
        results.push({ orderId: id, success: allSuccess });
      } catch (err) {
        results.push({ orderId: id, success: false, error: err.message });
      }
    }

    res.json({
      total: orderIds.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
