const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth-middleware');
const { runMatching, getMatchById } = require('../engine/matching');
const { recommendVolunteers } = require('../engine/volunteers');
const { sendWhatsApp } = require('../notify');
const { emitRooms, notifyRooms, computeLegs } = require('../realtime');

const router = express.Router();

const STATUS_FLOW = ['matched', 'picked_up', 'delivered'];

// Forward-only step map (prevents skipping matched→delivered or reverting)
const NEXT_STATUS = { matched: 'picked_up', picked_up: 'delivered' };

const safeParse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// List all matches with donation + NGO + volunteer details
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, d.food_name, d.food_type, d.quantity, d.unit, d.is_perishable, d.expiry_time,
           d.address AS pickup_address, d.lat AS pickup_lat, d.lng AS pickup_lng,
           d.photo_url, d.donor_name, d.donor_id, d.status AS donation_status,
           n.name AS ngo_name, n.address AS dropoff_address, n.lat AS dropoff_lat, n.lng AS dropoff_lng,
           n.contact_phone AS ngo_phone,
           v.name AS volunteer_name, v.phone AS volunteer_phone, v.current_lat, v.current_lng
    FROM matches m
    JOIN donations d ON d.id = m.donation_id
    JOIN ngos n ON n.id = m.ngo_id
    LEFT JOIN volunteers v ON v.id = m.volunteer_id
    ORDER BY m.matched_at DESC, m.id DESC
  `).all();
  res.json(rows.map((r) => ({ ...r, score_breakdown: safeParse(r.score_breakdown) })));
});

router.get('/:id', (req, res) => {
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json({ ...match, score_breakdown: safeParse(match.score_breakdown) });
});

/** Run the AI matching engine (batch over all pending donations, or one). */
router.post('/run', requireRole('admin', 'volunteer'), (req, res) => {
  const { donation_id } = req.body || {};
  const assignments = runMatching(donation_id ? Number(donation_id) : null);
  res.json({
    matched: assignments.length,
    assignments: assignments.map((a) => ({
      matchId: a.matchId, donationId: a.donationId, ngoName: a.ngoName,
      score: a.score, reasons: a.reasons, breakdown: a.breakdown,
    })),
  });
});

/** Ranked volunteer recommendations for a match (top recommendation first). */
router.get('/:id/volunteer-recommendations', (req, res) => {
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(recommendVolunteers(match));
});

/** Manual volunteer override / accept. */
router.patch('/:id/assign-volunteer', requireAuth, (req, res) => {
  const { volunteer_id } = req.body || {};
  const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(volunteer_id);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  db.prepare('UPDATE matches SET volunteer_id = ? WHERE id = ?').run(volunteer.id, match.id);
  sendWhatsApp(volunteer.phone,
    `ShareBite AI: pickup task — "${match.food_name}" (${match.quantity} ${match.unit}) from ${match.pickup_address} to ${match.ngo_name}, ${match.dropoff_address}.`);

  // Real-time: donor + NGO + admin see the volunteer is on it
  const rooms = [`donor:${match.donor_id}`, `ngo:${match.ngo_id}`, 'admin'];
  notifyRooms([
    [rooms, `🚴 ${volunteer.name} accepted the pickup of "${match.food_name}" — track it live on the map.`],
  ]);
  emitRooms(rooms, 'delivery:accepted', { matchId: match.id, volunteerName: volunteer.name, status: 'matched' });

  res.json(getMatchById(match.id));
});

/** Status tracking: matched → picked_up → delivered only (syncs donation status). */
router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_FLOW.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUS_FLOW.join(', ')}` });
  }
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status === status) return res.json(getMatchById(match.id));
  const expected = NEXT_STATUS[match.status];
  if (expected !== status) {
    return res.status(400).json({ error: `Invalid transition: ${match.status} → ${status}. Next step is ${expected || 'none (delivered is final)'}.` });
  }
  if ((status === 'picked_up' || status === 'delivered') && !match.volunteer_id) {
    return res.status(400).json({ error: 'Assign a volunteer before marking pickup / delivery.' });
  }

  db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, match.id);
  db.prepare('UPDATE donations SET status = ? WHERE id = ?').run(
    status === 'matched' ? 'matched' : status, match.donation_id
  );

  const rooms = [`donor:${match.donor_id}`, `ngo:${match.ngo_id}`, 'admin'];
  let legs = null;
  if (status === 'picked_up') {
    const vol = match.volunteer_id
      ? db.prepare('SELECT current_lat, current_lng FROM volunteers WHERE id = ?').get(match.volunteer_id)
      : null;
    legs = computeLegs(match, vol && vol.current_lat != null ? { lat: vol.current_lat, lng: vol.current_lng } : null);
    if (match.volunteer_id) {
      sendWhatsApp(match.ngo_phone,
        `ShareBite AI: volunteer ${match.volunteer_name} is on the way for "${match.food_name}".`);
    }
    notifyRooms([[
      [`ngo:${match.ngo_id}`, `donor:${match.donor_id}`],
      `📦 "${match.food_name}" picked up and on the way to you — ETA ~${legs.toDropoff.etaMin} min (${legs.toDropoff.km} km).`,
    ]]);
  }
  if (status === 'delivered' && match.volunteer_id) {
    db.prepare('UPDATE volunteers SET deliveries_done = deliveries_done + 1 WHERE id = ?')
      .run(match.volunteer_id);
    sendWhatsApp(match.ngo_phone,
      `ShareBite AI: delivered "${match.food_name}" (${match.quantity} ${match.unit}). Thank you for feeding hope!`);
    notifyRooms([[
      [...rooms, `volunteer:${match.volunteer_user_id}`],
      `✅ Delivery completed — "${match.food_name}" reached ${match.ngo_name}. Meals saved, hope delivered.`,
    ]]);
  }
  emitRooms(rooms, 'delivery:status', { matchId: match.id, status, eta: legs ? legs.toDropoff : null });

  res.json(getMatchById(match.id));
});

/** Volunteer shares live GPS position → stored, and pushed to everyone tracking this delivery. */
router.post('/:id/track', requireAuth, (req, res) => {
  const { lat, lng } = req.body || {};
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  if (match.volunteer_id) {
    db.prepare('UPDATE volunteers SET current_lat = ?, current_lng = ? WHERE id = ?')
      .run(lat, lng, match.volunteer_id);
  }
  db.prepare('INSERT INTO delivery_tracking (match_id, volunteer_lat, volunteer_lng) VALUES (?, ?, ?)')
    .run(match.id, lat, lng);

  const legs = computeLegs(match, { lat, lng });
  const payload = { matchId: match.id, lat, lng, timestamp: new Date().toISOString(), legs };
  emitRooms([`match:${match.id}`, `donor:${match.donor_id}`, `ngo:${match.ngo_id}`, 'admin'],
    'delivery:location', payload);
  res.json({ ok: true, legs });
});

/** Full tracking snapshot: match + volunteer position + route history + leg ETAs. */
router.get('/:id/tracking', (req, res) => {
  const match = getMatchById(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const points = db.prepare(`
    SELECT volunteer_lat AS lat, volunteer_lng AS lng, timestamp
    FROM delivery_tracking WHERE match_id = ? ORDER BY id DESC LIMIT 50
  `).all(req.params.id).reverse();
  const vol = match.volunteer_id
    ? db.prepare('SELECT current_lat, current_lng FROM volunteers WHERE id = ?').get(match.volunteer_id)
    : null;
  const live = vol && vol.current_lat != null ? { lat: vol.current_lat, lng: vol.current_lng } : null;
  res.json({
    match: {
      id: match.id, food_name: match.food_name, quantity: match.quantity, unit: match.unit,
      status: match.status, pickup: { lat: match.pickup_lat, lng: match.pickup_lng, label: match.pickup_address },
      dropoff: { lat: match.dropoff_lat, lng: match.dropoff_lng, label: match.dropoff_address },
      volunteer_name: match.volunteer_name,
    },
    volunteer: live,
    points,
    legs: computeLegs(match, live),
  });
});

module.exports = router;
