/**
 * Request validation helpers.
 * Controllers validate input shape here instead of inline `if (!x)` soup.
 */
const { ApiError } = require('./http');

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

const asNumber = (v, field) => {
  const n = Number(v);
  if (!isFiniteNumber(n)) throw ApiError.badRequest(`${field} must be a number`);
  return n;
};

const requiredString = (v, field) => {
  if (typeof v !== 'string' || !v.trim()) throw ApiError.badRequest(`${field} is required`);
  return v.trim();
};

const optionalString = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

const requiredCoordinate = (v, field) => {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) throw ApiError.badRequest(`${field} is required`);
  return n;
};

const oneOf = (v, allowed, field) => {
  if (!allowed.includes(v)) throw ApiError.badRequest(`${field} must be one of ${allowed.join(', ')}`);
  return v;
};

module.exports = { isFiniteNumber, asNumber, requiredString, optionalString, requiredCoordinate, oneOf };
