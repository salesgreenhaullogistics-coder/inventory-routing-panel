const { getDb } = require('../db/database');
const { SCORING_WEIGHTS } = require('../utils/constants');

/**
 * Multi-Factor Warehouse Scoring Engine
 *
 * Each warehouse is scored on 6 factors:
 * - Distance Score (35%): 1/distance — closer = higher
 * - Inventory Score (25%): available_qty / required_qty — more stock = higher
 * - Load Score (15%): 1 - (current_load / max_capacity) — less loaded = higher
 * - Speed Score (10%): 1 / avg_delivery_days — faster = higher
 * - Cost Score (5%): 1 / base_shipping_cost — cheaper = higher
 * - RTO Score (10%): 1 - rto_rate — lower return probability = higher
 */

function calculateDistanceScore(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 1.0;
  return 1 / distanceKm;
}

function calculateInventoryScore(availableQty, requiredQty) {
  if (requiredQty <= 0) return 1.0;
  if (availableQty <= 0) return 0;
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

function calculateRtoScore(rtoRate) {
  if (rtoRate === undefined || rtoRate === null) return 0.95; // default: 5% RTO = 0.95 score
  return Math.max(0, 1 - rtoRate);
}

/**
 * Normalize scores across all warehouses so they are comparable (0-1 range).
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
 */
function scoreWarehouses(warehousesWithData, requiredQty) {
  if (warehousesWithData.length === 0) return [];

  const scored = warehousesWithData.map(wh => ({
    ...wh,
    rawScores: {
      distance: calculateDistanceScore(wh.distanceKm),
      inventory: calculateInventoryScore(wh.availableQty, requiredQty),
      load: calculateLoadScore(wh.currentLoad || 0, wh.maxCapacity || 1000),
      speed: calculateSpeedScore(wh.avgDeliveryDays || 3),
      cost: calculateCostScore(wh.baseShippingCost || 50),
      rto: calculateRtoScore(wh.rtoRate),
    },
    normalizedScores: {},
  }));

  normalizeScores(scored, 'distance');
  normalizeScores(scored, 'inventory');
  normalizeScores(scored, 'load');
  normalizeScores(scored, 'speed');
  normalizeScores(scored, 'cost');
  normalizeScores(scored, 'rto');

  for (const wh of scored) {
    const n = wh.normalizedScores;
    wh.routingScore =
      (n.distance * SCORING_WEIGHTS.DISTANCE) +
      (n.inventory * SCORING_WEIGHTS.INVENTORY) +
      (n.load * SCORING_WEIGHTS.LOAD) +
      (n.speed * SCORING_WEIGHTS.SPEED) +
      (n.cost * SCORING_WEIGHTS.COST) +
      (n.rto * (SCORING_WEIGHTS.RTO || 0));

    wh.distanceScore = n.distance;
    wh.inventoryScore = n.inventory;
    wh.loadScore = n.load;
    wh.speedScore = n.speed;
    wh.costScore = n.cost;
    wh.rtoScore = n.rto;
  }

  scored.sort((a, b) => {
    const scoreDiff = b.routingScore - a.routingScore;
    if (Math.abs(scoreDiff) < 0.001) {
      return (a.priority || 99) - (b.priority || 99);
    }
    return scoreDiff;
  });

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
    rtoScore: Math.round(wh.rtoScore * 10000) / 10000,
    rank: i + 1,
  }));
}

/**
 * Score interpretation bands for UI display.
 */
function getScoreBand(score) {
  const pct = Math.round((score || 0) * 100);
  if (pct >= 75) return { label: 'Excellent', color: 'green', pct };
  if (pct >= 50) return { label: 'Good', color: 'blue', pct };
  if (pct >= 25) return { label: 'Fair', color: 'amber', pct };
  return { label: 'Poor', color: 'red', pct };
}

function getScorePercent(score) {
  return Math.round((score || 0) * 100);
}

function incrementWarehouseLoad(warehouseId, qty) {
  const db = getDb();
  db.prepare('UPDATE warehouses SET current_load = current_load + ? WHERE id = ?').run(qty, warehouseId);
}

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
  calculateRtoScore,
  getScoreBand,
  getScorePercent,
};
