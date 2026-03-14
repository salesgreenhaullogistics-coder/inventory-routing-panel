const { getDb } = require('../db/database');
const { SCORING_WEIGHTS } = require('../utils/constants');

/**
 * Multi-Factor Warehouse Scoring Engine
 *
 * Each warehouse is scored on 5 factors:
 * - Distance Score (40%): 1/distance — closer = higher
 * - Inventory Score (30%): available_qty / required_qty — more stock = higher
 * - Load Score (15%): 1 - (current_load / max_capacity) — less loaded = higher
 * - Speed Score (10%): 1 / avg_delivery_days — faster = higher
 * - Cost Score (5%): 1 / base_shipping_cost — cheaper = higher
 *
 * Final: (dist*0.40) + (inv*0.30) + (load*0.15) + (speed*0.10) + (cost*0.05)
 */

function calculateDistanceScore(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 1.0; // same pincode = max score
  return 1 / distanceKm;
}

function calculateInventoryScore(availableQty, requiredQty) {
  if (requiredQty <= 0) return 1.0;
  if (availableQty <= 0) return 0;
  // Cap at 1.0 (having more than needed doesn't increase score beyond 1)
  return Math.min(availableQty / requiredQty, 1.0);
}

function calculateLoadScore(currentLoad, maxCapacity) {
  if (maxCapacity <= 0) return 0;
  const utilization = currentLoad / maxCapacity;
  return Math.max(0, 1 - utilization);
}

function calculateSpeedScore(avgDeliveryDays) {
  if (!avgDeliveryDays || avgDeliveryDays <= 0) return 1.0;
  return 1 / avgDeliveryDays;
}

function calculateCostScore(baseShippingCost) {
  if (!baseShippingCost || baseShippingCost <= 0) return 1.0;
  return 1 / baseShippingCost;
}

/**
 * Normalize scores across all warehouses so they are comparable (0-1 range).
 * Uses min-max normalization within the set.
 */
function normalizeScores(warehouseScores, key) {
  const values = warehouseScores.map(ws => ws.rawScores[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  for (const ws of warehouseScores) {
    ws.normalizedScores[key] = range === 0 ? 1.0 : (ws.rawScores[key] - min) / range;
  }
}

/**
 * Score all warehouses for a given item.
 *
 * @param {Array} warehousesWithData - Array of { warehouseId, warehouseName, distanceKm, availableQty, priority, currentLoad, maxCapacity, avgDeliveryDays, baseShippingCost }
 * @param {number} requiredQty - Quantity needed
 * @returns {Array} Sorted array (highest score first) with all scoring details
 */
function scoreWarehouses(warehousesWithData, requiredQty) {
  if (warehousesWithData.length === 0) return [];

  // Calculate raw scores
  const scored = warehousesWithData.map(wh => ({
    ...wh,
    rawScores: {
      distance: calculateDistanceScore(wh.distanceKm),
      inventory: calculateInventoryScore(wh.availableQty, requiredQty),
      load: calculateLoadScore(wh.currentLoad || 0, wh.maxCapacity || 1000),
      speed: calculateSpeedScore(wh.avgDeliveryDays || 3),
      cost: calculateCostScore(wh.baseShippingCost || 50),
    },
    normalizedScores: {},
  }));

  // Normalize each factor across all warehouses
  normalizeScores(scored, 'distance');
  normalizeScores(scored, 'inventory');
  normalizeScores(scored, 'load');
  normalizeScores(scored, 'speed');
  normalizeScores(scored, 'cost');

  // Calculate final routing score
  for (const wh of scored) {
    const n = wh.normalizedScores;
    wh.routingScore =
      (n.distance * SCORING_WEIGHTS.DISTANCE) +
      (n.inventory * SCORING_WEIGHTS.INVENTORY) +
      (n.load * SCORING_WEIGHTS.LOAD) +
      (n.speed * SCORING_WEIGHTS.SPEED) +
      (n.cost * SCORING_WEIGHTS.COST);

    // Store individual scores for transparency
    wh.distanceScore = n.distance;
    wh.inventoryScore = n.inventory;
    wh.loadScore = n.load;
    wh.speedScore = n.speed;
    wh.costScore = n.cost;
  }

  // Sort by routing score descending; break ties with warehouse priority (lower = better)
  scored.sort((a, b) => {
    const scoreDiff = b.routingScore - a.routingScore;
    if (Math.abs(scoreDiff) < 0.001) {
      return (a.priority || 99) - (b.priority || 99);
    }
    return scoreDiff;
  });

  // Assign ranks (1 = best)
  return scored.map((wh, i) => ({
    warehouseId: wh.warehouseId,
    warehouseName: wh.warehouseName,
    distanceKm: wh.distanceKm,
    availableQty: wh.availableQty,
    priority: wh.priority,
    routingScore: Math.round(wh.routingScore * 10000) / 10000,
    distanceScore: Math.round(wh.distanceScore * 10000) / 10000,
    inventoryScore: Math.round(wh.inventoryScore * 10000) / 10000,
    loadScore: Math.round(wh.loadScore * 10000) / 10000,
    speedScore: Math.round(wh.speedScore * 10000) / 10000,
    costScore: Math.round(wh.costScore * 10000) / 10000,
    rank: i + 1,
  }));
}

/**
 * Update warehouse load after assigning an order.
 */
function incrementWarehouseLoad(warehouseId, qty) {
  const db = getDb();
  db.prepare('UPDATE warehouses SET current_load = current_load + ? WHERE id = ?').run(qty, warehouseId);
}

/**
 * Get current warehouse load data.
 */
function getWarehouseLoadData() {
  const db = getDb();
  return db.prepare('SELECT id, current_load, max_capacity FROM warehouses').all();
}

module.exports = {
  scoreWarehouses,
  incrementWarehouseLoad,
  getWarehouseLoadData,
  calculateDistanceScore,
  calculateInventoryScore,
  calculateLoadScore,
  calculateSpeedScore,
  calculateCostScore,
};
