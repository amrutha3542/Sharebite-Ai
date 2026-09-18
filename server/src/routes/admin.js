const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../auth-middleware');
const { recentNotifications } = require('../notify');

const router = express.Router();

// Public impact numbers for the landing page (no login needed)
router.get('/public-stats', (req, res) => {
  const totals = db.prepare(`
    SELECT COUNT(*) AS total_donations,
           COALESCE(SUM(CASE WHEN unit = 'kg' THEN quantity ELSE quantity * 0.25 END), 0) AS estimated_kg
    FROM donations WHERE status != 'cancelled'
  `).get();
  const delivered = db.prepare(`
    SELECT COUNT(*) AS count,
           COALESCE(SUM(CASE WHEN d.unit = 'kg' THEN d.quantity ELSE d.quantity * 0.25 END), 0) AS kg
    FROM donations d WHERE d.status = 'delivered'
  `).get();
  const partners = db.prepare(`SELECT COUNT(*) AS c FROM ngos WHERE active = 1`).get();
  const donors = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'donor'`).get();
  res.json({
    donors: donors.c, ngoPartners: partners.c,
    mealsRedirected: totals.total_donations, delivered: delivered.count,
    wasteKg: Math.round(totals.estimated_kg * 10) / 10,
    wasteT: Math.round((totals.estimated_kg / 1000) * 10) / 10,
    rescueRate: totals.total_donations ? Math.round((delivered.count / totals.total_donations) * 100) : 0,
  });
});

router.use(requireAuth);

// Non-perishable donations left unmatched longer than this get flagged on the dashboard
const UNMATCHED_ALERT_MINUTES = 30;

router.get('/stats', (req, res) => {
  const totals = db.prepare(`
    SELECT COUNT(*) AS total_donations,
           COALESCE(SUM(CASE WHEN unit = 'kg' THEN quantity ELSE quantity * 0.25 END), 0) AS estimated_kg
    FROM donations WHERE status != 'cancelled'
  `).get();

  const delivered = db.prepare(`
    SELECT COUNT(*) AS count,
           COALESCE(SUM(CASE WHEN d.unit = 'kg' THEN d.quantity ELSE d.quantity * 0.25 END), 0) AS kg
    FROM donations d WHERE d.status = 'delivered'
  `).get();

  const inFlight = db.prepare(`
    SELECT status, COUNT(*) AS count FROM donations GROUP BY status
  `).all();

  const roleCounts = db.prepare(`
    SELECT role, COUNT(*) AS count FROM users GROUP BY role
  `).all();

  const pending = db.prepare(`
    SELECT *, (julianday('now') - julianday(created_at)) * 1440 AS minutes_waiting
    FROM donations WHERE status = 'donated' ORDER BY is_perishable DESC, expiry_time ASC
  `).all().map((d) => ({ ...d, flagged: d.minutes_waiting > UNMATCHED_ALERT_MINUTES }));

  const areaBreakdown = db.prepare(`
    SELECT address,
           COUNT(*) AS donations,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
           COALESCE(SUM(CASE WHEN unit = 'kg' THEN quantity ELSE quantity * 0.25 END), 0) AS estimated_kg
    FROM donations GROUP BY address ORDER BY donations DESC
  `).all();

  const ngoLoad = db.prepare(`
    SELECT name, daily_capacity, received_today,
           ROUND(100.0 * received_today / daily_capacity, 1) AS pct_full
    FROM ngos WHERE active = 1 ORDER BY pct_full DESC
  `).all();

  res.json({
    totals: {
      donations: totals.total_donations,
      estimatedKg: Math.round(totals.estimated_kg * 10) / 10,
      delivered: delivered.count,
      deliveredKg: Math.round(delivered.kg * 10) / 10,
      rescueRate: totals.total_donations ? Math.round((delivered.count / totals.total_donations) * 100) : 0,
      byStatus: inFlight,
    },
    activeUsers: roleCounts,
    pendingUnmatched: pending,
    areaBreakdown,
    ngoLoad,
    notifications: recentNotifications(8),
  });
});

// Live map: all in-flight deliveries (matched / picked_up) with positions
router.get('/livemap', (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.status, d.food_name, d.address AS pickup_address, d.lat AS pickup_lat, d.lng AS pickup_lng,
           n.name AS ngo_name, n.address AS dropoff_address, n.lat AS dropoff_lat, n.lng AS dropoff_lng,
           v.name AS volunteer_name, v.current_lat, v.current_lng
    FROM matches m
    JOIN donations d ON d.id = m.donation_id
    JOIN ngos n ON n.id = m.ngo_id
    LEFT JOIN volunteers v ON v.id = m.volunteer_id
    WHERE m.status IN ('matched', 'picked_up')
    ORDER BY m.id DESC
  `).all();
  res.json(rows);
});

// Reset & reseed demo data (admin only — handy right before a pitch)
router.post('/seed', requireAdmin, (req, res) => {
  const { resetDb } = require('../db');
  resetDb();
  res.json({ ok: true, message: 'Demo data reset.' });
});

module.exports = router;
