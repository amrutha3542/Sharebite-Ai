/**
 * Auth service — session issuance + credential verification.
 * Routes call this; hashing details stay in auth-utils.js.
 */
const { db } = require('../db');
const { makeSalt, hashPassword, verifyPassword, newToken } = require('../auth-utils');
const { ApiError } = require('../utils/http');
const { requiredString } = require('../utils/validate');

const DEMO_PASSWORD = 'demo1234';

const PUBLIC_ROLES = ['donor', 'ngo', 'volunteer'];

const toPublicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role } : null);

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email || '').trim()) || null;
}

function createSession(userId) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function login({ email, password }) {
  const cleanEmail = requiredString(email || '', 'Email');
  const user = findByEmail(cleanEmail);
  if (!user || !user.password_hash || !user.salt || !verifyPassword(password || '', user.salt, user.password_hash)) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  return { user: toPublicUser(user), token: createSession(user.id) };
}

function register(payload = {}) {
  const name = requiredString(payload.name || '', 'name');
  const role = requiredString(payload.role || '', 'role');
  if (!PUBLIC_ROLES.includes(role)) throw ApiError.badRequest('role must be one of donor / ngo / volunteer');
  const password = String(payload.password || '');
  if (password.length < 6) throw ApiError.badRequest('Password must be at least 6 characters');

  const email = typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : null;
  if (email && findByEmail(email)) throw ApiError.conflict('An account with this email already exists');

  const salt = makeSalt();
  const userId = db.prepare(
    'INSERT INTO users (name, email, phone, role, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, email, payload.phone || null, role, hashPassword(password, salt), salt).lastInsertRowid;

  if (role === 'ngo') {
    db.prepare(`INSERT INTO ngos (user_id, name, contact_phone, address, lat, lng, daily_capacity, need_description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, name, payload.phone || null, payload.address || '',
        Number(payload.lat ?? 12.9716), Number(payload.lng ?? 77.5946),
        Number(payload.daily_capacity) || 50, payload.need_description || '');
  } else if (role === 'volunteer') {
    db.prepare(`INSERT INTO volunteers (user_id, name, phone, lat, lng, availability_start, availability_end)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, name, payload.phone || null,
        Number(payload.lat ?? 12.9716), Number(payload.lng ?? 77.5946),
        Number(payload.availability_start ?? 8), Number(payload.availability_end ?? 22));
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return { user: toPublicUser(user), token: createSession(userId) };
}

function resolveSession(token) {
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}

function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return { ok: true };
}

module.exports = { DEMO_PASSWORD, PUBLIC_ROLES, toPublicUser, findByEmail, createSession, login, register, resolveSession, logout };
