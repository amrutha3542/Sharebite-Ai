/**
 * Donation service — persistence + domain rules for the donor vertical slice.
 * Expiry guard lives here so both POST /donations and batch matching share it.
 */
const { db } = require('../db');
const { ApiError } = require('../utils/http');
const { requiredString, optionalString, requiredCoordinate, asNumber } = require('../utils/validate');

const CANCELLED = 'cancelled';
const DONATED = 'donated';

const isExpiredPerishable = (donation) =>
  Boolean(donation?.is_perishable) &&
  Boolean(donation?.expiry_time) &&
  new Date(donation.expiry_time).getTime() <= Date.now();

function normalizeDonationInput(body = {}) {
  const foodName = requiredString(body.food_name || '', 'food_name');
  const quantity = asNumber(body.quantity, 'quantity');
  if (quantity <= 0) throw ApiError.badRequest('quantity must be greater than 0');
  return {
    donorId: body.donor_id ?? null,
    donorName: optionalString(body.donor_name, 'Demo Donor'),
    donorPhone: optionalString(body.donor_phone, 'donor'),
    foodName,
    foodType: optionalString(body.food_type, 'Cooked meals'),
    quantity,
    unit: optionalString(body.unit, 'servings'),
    isPerishable: body.is_perishable ? 1 : 0,
    expiryTime: body.expiry_time || null,
    lat: requiredCoordinate(body.lat, 'lat'),
    lng: requiredCoordinate(body.lng, 'lng'),
    address: optionalString(body.address, ''),
    photoUrl: body.photo_url || null,
    quality: optionalString(body.quality, 'good'),
  };
}

function createDonation(input) {
  const info = db.prepare(`
    INSERT INTO donations
      (donor_id, donor_name, food_name, food_type, quantity, unit, is_perishable,
       expiry_time, lat, lng, address, photo_url, quality)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.donorId, input.donorName, input.foodName, input.foodType,
    input.quantity, input.unit, input.isPerishable,
    input.expiryTime, Number(input.lat), Number(input.lng), input.address,
    input.photoUrl, input.quality
  );
  return db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
}

function getDonation(id) {
  const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  if (!donation) throw ApiError.notFound('Donation not found');
  return donation;
}

function listDonations({ status, donorId } = {}) {
  let sql = 'SELECT * FROM donations';
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (donorId) { clauses.push('donor_id = ?'); params.push(donorId); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC, id DESC';
  return db.prepare(sql).all(...params);
}

function assertCancellable(donation) {
  const match = db.prepare('SELECT id FROM matches WHERE donation_id = ?').get(donation.id);
  if (match || donation.status !== DONATED) {
    throw ApiError.badRequest(`Cannot cancel — donation is already ${donation.status}.`);
  }
}

function assertCanCancel(donation, user) {
  assertCancellable(donation);
  const owns = user?.role === 'admin' ||
    (user?.role === 'donor' && (donation.donor_id === user.id || donation.donor_name === user.name));
  if (!owns) throw ApiError.forbidden('Only the donor who posted this (or an admin) can cancel it.');
  db.prepare(`UPDATE donations SET status = ? WHERE id = ?`).run(CANCELLED, donation.id);
  return db.prepare('SELECT * FROM donations WHERE id = ?').get(donation.id);
}

module.exports = {
  CANCELLED, DONATED, isExpiredPerishable,
  normalizeDonationInput, createDonation, getDonation, listDonations,
  assertCancellable, assertCanCancel,
};
