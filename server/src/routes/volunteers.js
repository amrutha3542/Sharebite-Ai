const express = require('express');
const { db } = require('../db');

const router = express.Router();

// List volunteers with live workload
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM matches m WHERE m.volunteer_id = v.id AND m.status != 'delivered') AS active_tasks
    FROM volunteers v ORDER BY v.reliability_rating DESC
  `).all();
  res.json(rows);
});

// NGO profiles (for the NGO dashboard and matching transparency)
router.get('/ngos', (req, res) => {
  const rows = db.prepare('SELECT * FROM ngos ORDER BY id').all();
  res.json(rows);
});

module.exports = router;
