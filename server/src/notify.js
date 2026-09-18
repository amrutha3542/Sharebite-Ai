const { db } = require('./db');

/**
 * WhatsApp notification stub (Twilio/Gupshup integration point).
 * For the hackathon we log and persist the message so the UI can show
 * a notification feed; wire a real provider SDK here later.
 */
function sendWhatsApp(to, message) {
  db.prepare('INSERT INTO notifications (recipient, channel, message) VALUES (?, ?, ?)').run(
    to || 'unknown',
    'whatsapp',
    message
  );
  console.log(`[whatsapp stub] → ${to || 'unknown'}: ${message}`);
}

/**
 * Fan-out: notify EVERY active NGO about a new donor post.
 * Used the moment a donation is created so NGOs see the post live,
 * even before the AI matcher assigns it.
 */
function notifyNgos(message, { exceptPhone = null } = {}) {
  const ngos = db.prepare('SELECT name, contact_phone FROM ngos WHERE active = 1').all();
  for (const ngo of ngos) {
    if (exceptPhone && ngo.contact_phone === exceptPhone) continue;
    sendWhatsApp(ngo.contact_phone, message);
  }
}

function recentNotifications(limit = 20, recipient = null) {
  if (recipient) {
    return db.prepare('SELECT * FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT ?')
      .all(recipient, limit);
  }
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = { sendWhatsApp, notifyNgos, recentNotifications };
