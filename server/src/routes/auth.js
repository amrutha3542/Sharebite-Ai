const express = require('express');
const { db } = require('../db');
const { asyncHandler, ok } = require('../utils/http');
const authService = require('../services/auth.service');

const router = express.Router();

const bearerToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

// List users (optionally by role) — powers the demo account picker
router.get('/users', asyncHandler(async (req, res) => {
  const { role } = req.query;
  const rows = role
    ? db.prepare('SELECT id, name, email, phone, role FROM users WHERE role = ?').all(role)
    : db.prepare('SELECT id, name, email, phone, role FROM users').all();
  return ok(res, rows);
}));

// Sign in with email + password (scrypt-verified) → session token
router.post('/login', asyncHandler(async (req, res) => {
  return ok(res, authService.login(req.body || {}));
}));

// Create an account — password hashed with scrypt, NGO/volunteer profiles included
router.post('/register', asyncHandler(async (req, res) => {
  return ok(res, authService.register(req.body || {}), 201);
}));

// Resolve the current session
router.get('/me', asyncHandler(async (req, res) => {
  const user = authService.resolveSession(bearerToken(req));
  if (!user) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  return ok(res, { user: authService.toPublicUser(user) });
}));

// Invalidate the session
router.post('/logout', asyncHandler(async (req, res) => {
  return ok(res, authService.logout(bearerToken(req)));
}));

module.exports = router;

