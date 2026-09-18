const crypto = require('crypto');

/** Password hashing with Node's built-in scrypt — no external dependency needed. */
function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

/** Opaque session token (stored server-side in the sessions table). */
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { makeSalt, hashPassword, verifyPassword, newToken };
