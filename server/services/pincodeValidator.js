const { getDb } = require('../db/database');
const { FAILURE_REASONS } = require('../utils/constants');

function validatePincode(pincode, orderId) {
  const db = getDb();

  if (!pincode || pincode.trim() === '') {
    db.prepare(
      'INSERT INTO pincode_errors (order_id, shipping_pincode, error_type) VALUES (?, ?, ?)'
    ).run(orderId, pincode || '', 'MISSING');
    return { valid: false, errorType: FAILURE_REASONS.MISSING_PINCODE };
  }

  const cleaned = pincode.trim();

  if (!/^\d{6}$/.test(cleaned)) {
    db.prepare(
      'INSERT INTO pincode_errors (order_id, shipping_pincode, error_type) VALUES (?, ?, ?)'
    ).run(orderId, cleaned, 'INVALID');
    return { valid: false, errorType: FAILURE_REASONS.INVALID_PINCODE };
  }

  const result = db.prepare('SELECT latitude, longitude FROM pincodes WHERE pincode = ?').get(cleaned);

  if (!result) {
    // Try to suggest a correction (nearby pincodes with same prefix)
    const prefix = cleaned.substring(0, 4);
    const suggestions = db.prepare(
      'SELECT pincode FROM pincodes WHERE pincode LIKE ? LIMIT 3'
    ).all(prefix + '%');

    const suggested = suggestions.length > 0 ? suggestions.map(s => s.pincode).join(', ') : null;

    db.prepare(
      'INSERT INTO pincode_errors (order_id, shipping_pincode, error_type, suggested_correction) VALUES (?, ?, ?, ?)'
    ).run(orderId, cleaned, 'NOT_SERVICEABLE', suggested);

    return { valid: false, errorType: FAILURE_REASONS.INVALID_PINCODE };
  }

  return { valid: true, latitude: result.latitude, longitude: result.longitude, pincode: cleaned };
}

module.exports = { validatePincode };
