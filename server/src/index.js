require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { seed } = require('./db');
const { initRealtime, startExpiryWatcher } = require('./realtime');
const { recentNotifications } = require('./notify');

const app = express();
app.use(cors());
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

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.path}]`, err);
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
initRealtime(server);       // Socket.io: live notifications + delivery tracking
startExpiryWatcher();       // admin alerts for perishable food expiring unmatched
server.listen(PORT, () => {
  console.log(`ShareBite AI API listening on http://localhost:${PORT}`);
});
