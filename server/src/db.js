const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { makeSalt, hashPassword } = require('./auth-utils');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'sharebite.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('donor','ngo','volunteer','admin')),
  password_hash TEXT,
  salt TEXT,
  verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ngos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  contact_phone TEXT,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  daily_capacity REAL NOT NULL DEFAULT 50,
  received_today REAL NOT NULL DEFAULT 0,
  need_description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  availability_start INTEGER NOT NULL DEFAULT 6,
  availability_end INTEGER NOT NULL DEFAULT 22,
  reliability_rating REAL NOT NULL DEFAULT 4.5,
  deliveries_done INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id INTEGER REFERENCES users(id),
  donor_name TEXT NOT NULL DEFAULT '',
  food_name TEXT NOT NULL,
  food_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'servings',
  is_perishable INTEGER NOT NULL DEFAULT 0,
  expiry_time TEXT,
  lat REAL,
  lng REAL,
  address TEXT,
  photo_url TEXT,
  quality TEXT NOT NULL DEFAULT 'good',
  status TEXT NOT NULL DEFAULT 'donated',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER NOT NULL UNIQUE REFERENCES donations(id),
  ngo_id INTEGER NOT NULL REFERENCES ngos(id),
  volunteer_id INTEGER REFERENCES volunteers(id),
  match_score REAL NOT NULL,
  score_breakdown TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'matched',
  matched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delivery_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  volunteer_lat REAL NOT NULL,
  volunteer_lng REAL NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ── Lightweight migrations for databases created before auth existed ──
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (userCols.length && !userCols.includes('password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  db.exec('ALTER TABLE users ADD COLUMN salt TEXT');
}

// Live location columns for volunteers (added in v2 tracking feature)
const volCols = db.prepare('PRAGMA table_info(volunteers)').all().map((c) => c.name);
if (volCols.length && !volCols.includes('current_lat')) {
  db.exec('ALTER TABLE volunteers ADD COLUMN current_lat REAL');
  db.exec('ALTER TABLE volunteers ADD COLUMN current_lng REAL');
}

// Demo accounts get a shared password so the one-click demo logins still work.
const DEMO_PASSWORD = 'demo1234';

function backfillPasswords() {
  const salted = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ? AND password_hash IS NULL');
  for (const row of db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all()) {
    const salt = makeSalt();
    salted.run(hashPassword(DEMO_PASSWORD, salt), salt, row.id);
  }
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const now = Date.now();
  const hoursFromNow = (h) => new Date(now + h * 3.6e6).toISOString();

  const addUser = db.prepare(
    'INSERT INTO users (name, email, phone, role) VALUES (?, ?, ?, ?)'
  );
  const donorUser = addUser.run('Anita Rao', 'anita@donor.demo', '+91-98000-00001', 'donor').lastInsertRowid;
  const hotelUser = addUser.run('Green Leaf Restaurant', 'hotel@donor.demo', '+91-98000-00002', 'donor').lastInsertRowid;
  addUser.run('ShareBite Admin', 'admin@sharebite.demo', '+91-98000-00009', 'admin');

  const addNgo = db.prepare(
    'INSERT INTO ngos (user_id, name, contact_phone, address, lat, lng, daily_capacity, received_today, need_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  addNgo.run(addUser.run('Annadhanam Foundation', 'ngo1@sharebite.demo', '+91-98000-10001', 'ngo').lastInsertRowid,
    'Annadhanam Foundation', '+91-98000-10001', 'Jayanagar 4th Block, Bengaluru', 12.9250, 77.5938,
    60, 10, 'Cooked meals for evening community kitchen');
  addNgo.run(addUser.run('Hope Kids Trust', 'ngo2@sharebite.demo', '+91-98000-10002', 'ngo').lastInsertRowid,
    'Hope Kids Charitable Trust', '+91-98000-10002', 'Indiranagar 100ft Road, Bengaluru', 12.9784, 77.6408,
    40, 5, 'Any vegetarian food for children home');
  addNgo.run(addUser.run('Karunashraya Home', 'ngo3@sharebite.demo', '+91-98000-10003', 'ngo').lastInsertRowid,
    'Karunashraya Old Age Home', '+91-98000-10003', 'Basavanagudi, Bengaluru', 12.9419, 77.5730,
    80, 20, 'Soft cooked meals, fruits welcome');
  addNgo.run(addUser.run('Sunrise Shelter', 'ngo4@sharebite.demo', '+91-98000-10004', 'ngo').lastInsertRowid,
    'Sunrise Shelter Home', '+91-98000-10004', 'Whitefield Main Road, Bengaluru', 12.9698, 77.7500,
    50, 0, 'Packaged staples and bread accepted anytime');

  const addVol = db.prepare(
    'INSERT INTO volunteers (user_id, name, phone, lat, lng, availability_start, availability_end, reliability_rating, deliveries_done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  addVol.run(addUser.run('Ravi Kumar', 'ravi@volunteer.demo', '+91-98000-20001', 'volunteer').lastInsertRowid,
    'Ravi Kumar', '+91-98000-20001', 12.9352, 77.6245, 8, 22, 4.8, 34);
  addVol.run(addUser.run('Meena Shetty', 'meena@volunteer.demo', '+91-98000-20002', 'volunteer').lastInsertRowid,
    'Meena Shetty', '+91-98000-20002', 12.9121, 77.6446, 9, 18, 4.6, 21);
  addVol.run(addUser.run('Arjun Prasad', 'arjun@volunteer.demo', '+91-98000-20003', 'volunteer').lastInsertRowid,
    'Arjun Prasad', '+91-98000-20003', 12.9784, 77.6408, 10, 21, 4.3, 12);
  addVol.run(addUser.run('Divya Raghav', 'divya@volunteer.demo', '+91-98000-20004', 'volunteer').lastInsertRowid,
    'Divya Raghav', '+91-98000-20004', 12.9166, 77.6101, 7, 23, 4.9, 47);

  const addDonation = db.prepare(
    `INSERT INTO donations
     (donor_id, donor_name, food_name, food_type, quantity, unit, is_perishable, expiry_time, lat, lng, address, photo_url, quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  addDonation.run(donorUser, 'Anita Rao', 'Vegetable pulao (freshly cooked)', 'Cooked meals',
    40, 'servings', 1, hoursFromNow(2), 12.9352, 77.6245, 'Koramangala 5th Block, Bengaluru',
    'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=700&q=80', 'excellent');
  addDonation.run(donorUser, 'Anita Rao', 'Assorted bakery items', 'Bakery',
    12, 'kg', 0, hoursFromNow(12), 12.9784, 77.6408, 'Indiranagar 100ft Road, Bengaluru',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80', 'good');
  addDonation.run(hotelUser, 'Green Leaf Restaurant', 'Seasonal fruits & vegetables', 'Fruits & vegetables',
    18, 'kg', 1, hoursFromNow(20), 12.9121, 77.6446, 'HSR Layout Sector 2, Bengaluru',
    'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=700&q=80', 'good');
  addDonation.run(hotelUser, 'Green Leaf Restaurant', 'Packaged biscuits & noodles', 'Packaged goods',
    8, 'kg', 0, hoursFromNow(72), 12.9698, 77.7500, 'Whitefield Main Road, Bengaluru',
    'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=700&q=80', 'excellent');

  console.log('[db] Seeded demo users, NGOs, volunteers and donations.');
  backfillPasswords();
}

// Cover databases that pre-date the auth columns
backfillPasswords();

function resetDb() {
  db.exec('DELETE FROM delivery_tracking; DELETE FROM sessions; DELETE FROM notifications; DELETE FROM matches; DELETE FROM donations; DELETE FROM volunteers; DELETE FROM ngos; DELETE FROM users;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('users','sessions','ngos','volunteers','donations','matches','delivery_tracking','notifications');");
  seed();
}

module.exports = { db, seed, resetDb, backfillPasswords, DEMO_PASSWORD };
