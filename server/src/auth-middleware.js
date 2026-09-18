const { db } = require('./db');
const { resolveSession } = require('./services/auth.service');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function getSessionUser(req) {
  return resolveSession(getBearerToken(req));
}

// Attach user if present, never rejects (for public GETs)
function optionalAuth(req, _res, next) {
  try { req.user = getSessionUser(req); } catch { req.user = null; }
  next();
}

// Require any logged-in user
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated — please log in' });
  req.user = user;
  next();
}

// Require one of the given roles (admin always passes)
function requireRole(...roles) {
  return (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated — please log in' });
    if (user.role === 'admin') { req.user = user; return next(); }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' / ')}` });
    }
    req.user = user;
    next();
  };
}

const requireAdmin = requireRole('admin');

module.exports = { getBearerToken, getSessionUser, optionalAuth, requireAuth, requireRole, requireAdmin };

