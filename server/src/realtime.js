const { db } = require('./db');
const { haversineKm } = require('./engine/geo');

/**
 * ── Real-time layer (Socket.io) ─────────────────────────────────────
 * Rooms:
 *   admin            — admin dashboard
 *   ngos             — broadcast to all NGO screens
 *   ngo:<id>         — a specific NGO (id = ngos.id)
 *   donor:<user_id>  — a donor's screens
 *   volunteer:<user_id> — a volunteer's screens
 *   match:<id>       — everyone tracking a specific delivery
 *
 * Two kinds of events:
 *   'toast'            — transient notification popups (already audience-filtered)
 *   domain events      — data sync signals pages use to reload live
 */
let io = null;
const AVG_SPEED_KMH = 18; // demo ETA assumption for city delivery

function initRealtime(server) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    socket.on('join', ({ rooms = [] } = {}) => {
      (Array.isArray(rooms) ? rooms : [rooms]).forEach((r) => r && socket.join(r));
    });
    socket.on('leave', ({ rooms = [] } = {}) => {
      (Array.isArray(rooms) ? rooms : [rooms]).forEach((r) => r && socket.leave(r));
    });
  });
  console.log('[realtime] Socket.io ready for live notifications + tracking');
  return io;
}

function emitRooms(rooms, event, payload) {
  if (!io) return;
  io.to(rooms.filter(Boolean)).emit(event, payload);
}

/** Push a toast notification to specific rooms (audience filtering happens here). */
function notifyRooms(roomsByMessage) {
  if (!io) return;
  for (const [rooms, message, extra] of roomsByMessage) {
    emitRooms(rooms, 'toast', { message, at: new Date().toISOString(), ...(extra || {}) });
  }
}

const etaMin = (km) => Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60));

/** Distance + ETA for both legs: volunteer→pickup and pickup→drop-off. */
function computeLegs(match, volunteerPos) {
  const pickup = { lat: match.pickup_lat, lng: match.pickup_lng };
  const dropoff = { lat: match.dropoff_lat, lng: match.dropoff_lng };
  const toPickupKm = volunteerPos && volunteerPos.lat != null
    ? haversineKm(volunteerPos.lat, volunteerPos.lng, pickup.lat, pickup.lng)
    : null;
  const pickupToDropKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    toPickup: toPickupKm == null ? null : { km: r1(toPickupKm), etaMin: etaMin(toPickupKm) },
    toDropoff: { km: r1(pickupToDropKm), etaMin: etaMin(pickupToDropKm) },
  };
}

/** Watcher: warn the admin when perishable food is about to expire unmatched. */
function startExpiryWatcher() {
  const alerted = new Set();
  setInterval(() => {
    try {
      const rows = db.prepare(`
        SELECT d.* FROM donations d
        LEFT JOIN matches m ON m.donation_id = d.id
        WHERE d.status = 'donated' AND d.is_perishable = 1 AND d.expiry_time IS NOT NULL AND m.id IS NULL
      `).all();
      for (const d of rows) {
        const mins = Math.round((new Date(d.expiry_time).getTime() - Date.now()) / 60000);
        if (mins > 0 && mins <= 20 && !alerted.has(d.id)) {
          alerted.add(d.id);
          const message = `⚠️ "${d.food_name}" expires in ${mins} min and is still unmatched — needs coordinator attention.`;
          db.prepare('INSERT INTO notifications (recipient, channel, message) VALUES (?, ?, ?)')
            .run('admin', 'system', message);
          emitRooms(['admin'], 'alert', { donationId: d.id, message, minutesLeft: mins });
          console.log(`[expiry watcher] ${message}`);
        }
      }
    } catch (err) {
      console.error('[expiry watcher]', err.message);
    }
  }, 30000);
}

module.exports = { initRealtime, emitRooms, notifyRooms, computeLegs, etaMin, startExpiryWatcher };
