require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { seed } = require('./db');
const { initRealtime, startExpiryWatcher } = require('./realtime');
const { recentNotifications } = require('./notify');

const app = express();

// Production-safe CORS: same-origin by default; set CLIENT_URL in split
// hosting (frontend on Vercel/Netlify, backend elsewhere). Local dev
// (Vite :5173) always allowed. Comma-separated list supported.
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const extraOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...devOrigins, ...extraOrigins]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / health checks
    if (allowedOrigins.has(origin)) return cb(null, true);
    // Single-server deploy: any same-host origin is fine (host varies per deploy)
    try {
      const host = process.env.HOSTNAME || '';
      if (host && new URL(origin).hostname === host) return cb(null, true);
    } catch { /* fall through to block */ }
    return cb(new Error(`CORS blocked for origin ${origin}`));
  },
}));
app.use(express.json({ limit: '2mb' }));

// Seed demo data on first boot
seed();

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'sharebite-ai', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/volunteers', require('./routes/volunteers'));
app.use('/api/admin', require('./routes/admin'));
app.get('/api/notifications', (req, res) => res.json(recentNotifications(30, req.query.recipient || null)));

// ── Production: serve the built React app (client/dist) from Express ──
// Same-origin => /api fetch + Socket.io need no extra config.
// React Router SPA fallback: non-/api GETs return index.html.
const distDir = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.log('[static] client/dist not found — run `npm run build` in client/ for single-server deploy.');
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.path}]`, err);
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
initRealtime(server, { allowedOrigins: [...allowedOrigins] }); // Socket.io: live notifications + delivery tracking
startExpiryWatcher();       // admin alerts for perishable food expiring unmatched
server.listen(PORT, () => {
  console.log(`ShareBite AI API listening on http://localhost:${PORT}`);
});
