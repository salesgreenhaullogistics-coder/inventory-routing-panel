const { getDb } = require('../db/database');

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.pow(Math.sin(dLon / 2), 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getPincodeCoordinates(pincode) {
  const db = getDb();
  return db.prepare('SELECT latitude, longitude FROM pincodes WHERE pincode = ?').get(pincode);
}

function getWarehouses() {
  const db = getDb();
  return db.prepare('SELECT * FROM warehouses').all();
}

function getDistancesToWarehouses(shippingPincode) {
  const coords = getPincodeCoordinates(shippingPincode);
  if (!coords) return null;

  const warehouses = getWarehouses();

  const distances = warehouses.map(wh => ({
    warehouseId: wh.id,
    warehouseName: wh.name,
    warehousePincode: wh.pincode,
    distanceKm: haversineKm(coords.latitude, coords.longitude, wh.latitude, wh.longitude),
  }));

  distances.sort((a, b) => a.distanceKm - b.distanceKm);

  return distances.map((d, i) => ({ ...d, rank: i + 1 }));
}

module.exports = { haversineKm, getPincodeCoordinates, getDistancesToWarehouses, getWarehouses };
