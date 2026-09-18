const { haversineKm } = require('./geo');
const { db } = require('../db');

/**
 * ── Volunteer Recommendation Engine ─────────────────────────────────
 * volunteer_score = proximity_to_pickup + proximity_to_dropoff
 *                 + availability_window_fit + past_reliability_rating
 */
const WEIGHTS = { pickup: 0.3, dropoff: 0.3, window: 0.2, reliability: 0.2 };
const MAX_KM = 8; // distances beyond 8 km contribute nothing to proximity

/**
 * Rank all available volunteers for a match.
 * @param {object} match row from getMatchById() (includes pickup/dropoff coords)
 */
function recommendVolunteers(match) {
  const volunteers = db.prepare("SELECT * FROM volunteers WHERE status = 'available'").all();
  const hour = new Date().getHours();

  const ranked = volunteers.map((v) => {
    const pickupKm = Math.round(haversineKm(v.lat, v.lng, match.pickup_lat, match.pickup_lng) * 10) / 10;
    const dropoffKm = Math.round(haversineKm(v.lat, v.lng, match.dropoff_lat, match.dropoff_lng) * 10) / 10;
    const pickupProx = 1 - Math.min(pickupKm / MAX_KM, 1);
    const dropoffProx = 1 - Math.min(dropoffKm / MAX_KM, 1);
    const windowFit = hour >= v.availability_start && hour < v.availability_end ? 1 : 0;
    const reliability = v.reliability_rating / 5;

    const score =
      WEIGHTS.pickup * pickupProx +
      WEIGHTS.dropoff * dropoffProx +
      WEIGHTS.window * windowFit +
      WEIGHTS.reliability * reliability;

    return {
      volunteer: {
        id: v.id, name: v.name, phone: v.phone,
        rating: v.reliability_rating, deliveries_done: v.deliveries_done,
      },
      score: Math.round(score * 1000) / 1000,
      breakdown: {
        pickupProximity: { score: pickupProx, weight: WEIGHTS.pickup, label: `${pickupKm} km from pickup` },
        dropoffProximity: { score: dropoffProx, weight: WEIGHTS.dropoff, label: `${dropoffKm} km from drop-off` },
        windowFit: {
          score: windowFit, weight: WEIGHTS.window,
          label: windowFit ? 'Within availability window' : `Off-window (free ${v.availability_start}:00–${v.availability_end}:00)`,
        },
        reliability: {
          score: reliability, weight: WEIGHTS.reliability,
          label: `${v.reliability_rating.toFixed(1)}★ across ${v.deliveries_done} deliveries`,
        },
      },
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

module.exports = { WEIGHTS, MAX_KM, recommendVolunteers };
