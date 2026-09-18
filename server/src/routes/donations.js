const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth-middleware');
const { asyncHandler, ok, ApiError } = require('../utils/http');
const donations = require('../services/donation.service');
const { runMatching, getMatchById } = require('../engine/matching');
const { notifyNgos, sendWhatsApp } = require('../notify');
const { emitRooms, notifyRooms } = require('../realtime');

const router = express.Router();

// List donations — optional filters: status, donor_id
router.get('/', asyncHandler(async (req, res) => {
  const { status, donor_id } = req.query;
  return ok(res, donations.listDonations({ status, donorId: donor_id }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const donation = donations.getDonation(req.params.id);
  const match = db.prepare('SELECT * FROM matches WHERE donation_id = ?').get(donation.id) || null;
  return ok(res, { donation, match });
}));

/**
 * Create a donation. Perishable donations are auto-matched immediately
 * (the differentiator: cooked food never waits for a human coordinator).
 * Expired perishables are rejected — they are flagged for admin instead.
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const input = donations.normalizeDonationInput(req.body || {});
  if (input.isPerishable && input.expiryTime && new Date(input.expiryTime).getTime() <= Date.now()) {
    db.prepare(`INSERT INTO notifications (recipient, channel, message) VALUES (?, ?, ?)`)
      .run('admin', 'system', `🚫 Expired post blocked: "${input.foodName}" from ${input.donorName} was already past best-before — not matched (food-safety guard).`);
    emitRooms(['admin'], 'alert', { message: `🚫 Expired post blocked: "${input.foodName}" was already past best-before.` });
    throw ApiError.badRequest('This food is already past its best-before time — it cannot be listed (food-safety guard).');
  }
  const donation = donations.createDonation(input);

  let match = null;
  if (input.isPerishable) {
    const [assignment] = runMatching(Number(donation.id));
    if (assignment) match = getMatchById(assignment.matchId);
    else sendWhatsApp(input.donorPhone, `ShareBite AI: "${input.foodName}" queued for matching — no NGO capacity free right now, we'll keep trying.`);
  }

  // Fan-out: every active NGO gets a live "new post" notification the
  // moment a donor uploads food (the auto-matched NGO already received
  // its dedicated match message, so skip it here).
  notifyNgos(
    `🔔 New donation posted: ${input.quantity} ${input.unit} of "${input.foodName}" ` +
    `from ${input.donorName} — pickup at ${input.address || 'see app'}.` +
    `${input.isPerishable ? ' ⚠ Perishable — time-sensitive!' : ''}`,
    { exceptPhone: match ? match.ngo_phone : null }
  );

  // ── Real-time fan-out ──
  const postMsg = `🔔 New donation posted: ${input.quantity} ${input.unit} of "${input.foodName}" ` +
    `from ${input.donorName} — pickup at ${input.address || 'see app'}.${input.isPerishable ? ' ⚠ Perishable — time-sensitive!' : ''}`;
  emitRooms(['ngos', 'admin'], 'donation:new', { donationId: donation.id, food_name: donation.food_name });
  notifyRooms([
    [['ngos', 'admin'], postMsg],
  ]);
  if (match) {
    const donorRoom = input.donorId ? [`donor:${input.donorId}`] : [];
    const fit = Math.round((match.match_score || 0) * 100);
    emitRooms([...donorRoom, `ngo:${match.ngo_id}`, 'admin'], 'match:created',
      { matchId: match.id, ngoName: match.ngo_name, score: match.match_score });
    notifyRooms([
      [donorRoom, `🎉 Your donation "${input.foodName}" was matched with ${match.ngo_name}! (AI fit ${fit}%)`],
      [['ngos', 'admin'], `🧠 AI matched "${input.foodName}" → ${match.ngo_name} (fit ${fit}%)`],
    ]);
  }

  return ok(res, { donation, match }, 201);
}));

/**
 * Cancel an unmatched donation (donor or admin only).
 * Matched / in-flight donations cannot be cancelled — contact the NGO.
 */
router.patch('/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const donation = donations.getDonation(req.params.id);
  const cancelled = donations.assertCanCancel(donation, req.user);
  emitRooms(['ngos', 'admin'], 'donation:cancelled', { donationId: donation.id, food_name: donation.food_name });
  return ok(res, { ok: true, donation: cancelled });
}));

module.exports = router;
