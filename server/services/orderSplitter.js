/**
 * Smart Split Order Logic
 *
 * Warehouses arrive pre-sorted by routing score (highest first).
 * Sequential allocation: best-scored warehouse gets filled first.
 *
 * Example: Order Qty = 10
 * Bangalore (score 0.85, avail 4) → allocate 4
 * Gurgaon   (score 0.72, avail 3) → allocate 3
 * Kolkata   (score 0.61, avail 3) → allocate 3
 * Total = 10 → fully fulfilled, marked as Split Order
 */
function splitOrder(requiredQty, sortedWarehouses) {
  const allocations = [];
  let remaining = requiredQty;

  for (let i = 0; i < sortedWarehouses.length; i++) {
    const wh = sortedWarehouses[i];
    if (wh.availableQty <= 0) continue;

    const allocate = Math.min(remaining, wh.availableQty);
    allocations.push({
      warehouseId: wh.warehouseId,
      warehouseName: wh.warehouseName,
      allocatedQty: allocate,
      rank: wh.rank,
      distanceKm: wh.distanceKm,
      routingScore: wh.routingScore || 0,
      distanceScore: wh.distanceScore || 0,
      inventoryScore: wh.inventoryScore || 0,
      loadScore: wh.loadScore || 0,
      speedScore: wh.speedScore || 0,
      costScore: wh.costScore || 0,
    });

    remaining -= allocate;
    if (remaining <= 0) break;
  }

  return {
    allocations,
    isSplit: allocations.length > 1,
    fulfilled: requiredQty - remaining,
    unfulfilled: remaining,
    totalAllocated: allocations.reduce((sum, a) => sum + a.allocatedQty, 0),
  };
}

module.exports = { splitOrder };
