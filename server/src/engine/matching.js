const { haversineKm } = require('./geo');
const { db } = require('../db');
const { sendWhatsApp } = require('../notify');

/**
 * ── AI Matching Engine ──────────────────────────────────────────────
 * score = (w1 × urgency) + (w2 × distance) + (w3 × quantity_fit) + (w4 × capacity)
 *
 * All pending donations are scored against ALL active NGOs (batch
 * matching). Donations are processed most-urgent-first so perishable
 * food claims scarce NGO capacity before packaged food — a
 * greedy-with-sorting approximation; the Hungarian Algorithm is the
 * natural next step for a globally optimal assignment.
 */
const WEIGHTS = { urgency: 0.35, distance: 0.25, quantityFit: 0.25, capacity: 0.15 };
const MAX_DISTANCE_KM = 15; // beyond this, distance score = 0
const MATCH_THRESHOLD = 0.25; // below this, leave the donation unmatched

const hoursUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 3.6e6;

/** Urgency: perishable food nearing expiry must move fastest. Expired food scores -1 (never matched). */
function urgencyScore(donation) {
  if (!donation.is_perishable) return { score: 0.2, label: 'Non-perishable — low urgency' };
  const h = hoursUntil(donation.expiry_time);
  if (h == null || Number.isNaN(h)) return { score: 0.65, label: 'Perishable — expiry unknown, treat as urgent' };
  if (h <= 0) return { score: -1, label: 'Past best-before — blocked by food-safety guard', expired: true };
  if (h < 1) return { score: 1, label: 'Perishable, <1h before expiry — critical' };
  // Linear ramp: 3h+ => 0.3 base, rising to 1.0 as expiry approaches
  const score = h >= 3 ? 0.3 : 0.3 + 0.7 * (1 - h / 3);
  return { score: Math.round(score * 1000) / 1000, label: h < 3 ? 'Perishable — high urgency' : 'Perishable — moderate urgency' };
}

/** Inverse-normalized distance between donor and NGO. */
function distanceScore(km) {
  return Math.max(0, 1 - km / MAX_DISTANCE_KM);
}

/** Gaussian curve centered on the NGO's remaining need — penalizes both under- and over-supply. */
function quantityFitScore(qty, remainingNeed) {
  if (remainingNeed <= 0) return { score: 0.05, label: 'NGO need already met today' };
  const sigma = Math.max(remainingNeed * 0.5, 2);
  const score = Math.exp(-((qty - remainingNeed) ** 2) / (2 * sigma ** 2));
  const fit = qty < remainingNeed ? 'under NGO need' : qty > remainingNeed * 1.5 ? 'over NGO need' : 'fits NGO need';
  return { score, label: `Quantity ${fit} of ${Math.round(remainingNeed)}` };
}

/** Prefer NGOs that haven't been flooded with donations today. */
function capacityScore(ngo) {
  const pct = Math.min(1, ngo.received_today / ngo.daily_capacity);
  return { score: 1 - pct, label: `NGO at ${Math.round(pct * 100)}% of daily capacity` };
}

/** Score one donation against one NGO; returns score + explainable breakdown. */
function scoreDonationForNgo(donation, ngo) {
  const urgency = urgencyScore(donation);
  const km = Math.round(haversineKm(donation.lat, donation.lng, ngo.lat, ngo.lng) * 10) / 10;
  const remaining = Math.max(0, ngo.daily_capacity - ngo.received_today);
  const dist = { score: distanceScore(km), label: `${km} km away`, km };
  const qty = quantityFitScore(donation.quantity, remaining);
  const cap = capacityScore(ngo);

  const score =
    WEIGHTS.urgency * urgency.score +
    WEIGHTS.distance * dist.score +
    WEIGHTS.quantityFit * qty.score +
    WEIGHTS.capacity * cap.score;

  return {
    score: Math.round(score * 1000) / 1000,
    ngo,
    breakdown: {
      urgency: { ...urgency, weight: WEIGHTS.urgency },
      distance: { ...dist, weight: WEIGHTS.distance },
      quantityFit: { ...qty, weight: WEIGHTS.quantityFit },
      capacity: { ...cap, weight: WEIGHTS.capacity },
    },
  };
}

function getMatchById(id) {
  return db.prepare(`
    SELECT m.*, d.food_name, d.food_type, d.quantity, d.unit, d.is_perishable, d.expiry_time,
           d.address AS pickup_address, d.lat AS pickup_lat, d.lng AS pickup_lng,
           d.photo_url, d.donor_name, d.donor_id, d.status AS donation_status,
           n.name AS ngo_name, n.address AS dropoff_address, n.lat AS dropoff_lat, n.lng AS dropoff_lng,
           n.contact_phone AS ngo_phone,
           v.name AS volunteer_name, v.phone AS volunteer_phone, v.user_id AS volunteer_user_id
    FROM matches m
    JOIN donations d ON d.id = m.donation_id
    JOIN ngos n ON n.id = m.ngo_id
    LEFT JOIN volunteers v ON v.id = m.volunteer_id
    WHERE m.id = ?
  `).get(id);
}

/**
 * Batch-match pending donations to NGOs.
 * @param {number|null} donationId match just this donation, or all pending when null
 * @returns {Array} assignments with full explainability data
 */
function runMatching(donationId = null) {
  const ngos = db.prepare('SELECT * FROM ngos WHERE active = 1').all();
  const pending = donationId
    ? db.prepare("SELECT * FROM donations WHERE id = ? AND status = 'donated'").all(donationId)
    : db.prepare("SELECT * FROM donations WHERE status = 'donated'").all();

  // Greedy-with-sorting: most urgent donations claim NGO capacity first.
  pending.sort((a, b) => urgencyScore(b).score - urgencyScore(a).score);

  const assignments = [];
  const insertMatch = db.prepare(
    'INSERT INTO matches (donation_id, ngo_id, match_score, score_breakdown) VALUES (?, ?, ?, ?)'
  );
  const flagExpired = db.prepare(`INSERT INTO notifications (recipient, channel, message) VALUES ('admin', 'system', ?)`);

  for (const donation of pending) {
    // Food-safety guard: never match expired perishables — flag for admin instead
    if (donation.is_perishable && donation.expiry_time && new Date(donation.expiry_time).getTime() <= Date.now()) {
      flagExpired.run(`🚫 Skipped expired donation #${donation.id} ("${donation.food_name}") — past best-before, not matched.`);
      continue;
    }
    let best = null;
    for (const ngo of ngos) {
      const s = scoreDonationForNgo(donation, ngo);
      if (!best || s.score > best.score) best = s;
    }
    if (!best || best.score < MATCH_THRESHOLD) continue;

    const result = insertMatch.run(
      donation.id, best.ngo.id, best.score, JSON.stringify(best.breakdown)
    );
    db.prepare("UPDATE donations SET status = 'matched' WHERE id = ?").run(donation.id);
    db.prepare('UPDATE ngos SET received_today = received_today + ? WHERE id = ?')
      .run(donation.quantity, best.ngo.id);

    const pct = Math.round(best.score * 100);
    sendWhatsApp(
      best.ngo.contact_phone,
      `ShareBite AI: matched ${donation.quantity} ${donation.unit} of "${donation.food_name}" from ${donation.donor_name} (fit ${pct}%). Pickup: ${donation.address}.`
    );

    assignments.push({
      matchId: Number(result.lastInsertRowid),
      donationId: donation.id,
      ngoId: best.ngo.id,
      ngoName: best.ngo.name,
      score: best.score,
      breakdown: best.breakdown,
      // Explainable AI — shown verbatim in the UI
      reasons: [
        best.breakdown.urgency.label,
        best.breakdown.distance.label,
        best.breakdown.quantityFit.label,
        best.breakdown.capacity.label,
      ],
    });
  }
  return assignments;
}

module.exports = {
  WEIGHTS, MAX_DISTANCE_KM, MATCH_THRESHOLD,
  urgencyScore, distanceScore, quantityFitScore, capacityScore,
  scoreDonationForNgo, runMatching, getMatchById,
};
