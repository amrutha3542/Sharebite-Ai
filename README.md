# ShareBite AI 🌿

**AI-powered surplus food redistribution platform** — connects food donors, NGOs, beneficiaries and volunteers, and replaces manual WhatsApp/phone coordination with an explainable AI matching engine.

> *Most food donation platforms coordinate manually — volunteers match donors to NGOs over WhatsApp and phone calls. ShareBite AI automates that decision-making with a weighted scoring engine, so the system scales to more cities and donors without proportionally more human coordinators.*

## Stack
- **Frontend**: React 18 + Vite + Tailwind CSS (`client/`)
- **Backend**: Node.js + Express (`server/`)
- **Database**: SQLite via Node's built-in `node:sqlite` (zero-config; Haversine geo replaces PostGIS — swap to PostgreSQL later)
- **Notifications**: WhatsApp stub (logged + persisted, ready for Twilio/Gupshup)

## Run the demo
```bash
# Terminal 1 — API (http://localhost:4000)
cd server && npm install && npm run dev

# Terminal 2 — Web app (http://localhost:5173, proxies /api to :4000)
cd client && npm install && npm run dev
```
Demo data seeds automatically on first boot. **Admin → "Reset demo data"** restores a fresh state any time.

## Authentication
- **Sign in / Create account page** at `/login` and `/register` (tabbed UI)
- Passwords hashed with Node's built-in **scrypt** + per-user salt; **session tokens** (stored in a `sessions` table, sent as `Authorization: Bearer`) power `/api/auth/me` and logout
- Registration is role-aware: NGOs add daily capacity + food needs; volunteers add availability window + base location — profiles feed straight into the matching engine
- **One-click demo accounts** remain on the auth page (shared demo password: `demo1234`)

## Demo logins
| Role | Email | Password |
|---|---|---|
| Donor | anita@donor.demo | demo1234 |
| NGO | ngo1@sharebite.demo | demo1234 |
| Volunteer | ravi@volunteer.demo | demo1234 |
| Admin | admin@sharebite.demo | demo1234 |

## The AI Matching Engine (`server/src/engine/matching.js`)
```
score = (0.35 × urgency) + (0.25 × distance) + (0.25 × quantity_fit) + (0.15 × ngo_capacity)
```
- **urgency** — perishable food nearing expiry scores highest (0.2 for packaged)
- **distance** — inverse-normalized Haversine distance donor→NGO (15 km cap)
- **quantity_fit** — Gaussian curve centered on the NGO's remaining daily need (penalizes over/under-supply)
- **ngo_capacity** — avoids flooding an NGO already near today's capacity

Pending donations are batch-scored against **all** NGOs, processed most-urgent-first (greedy-with-sorting; the Hungarian Algorithm is the natural future optimization). Every match returns a human-readable breakdown the UI shows as *"Matched because: …"*.

**Volunteer recommendation** (`server/src/engine/volunteers.js`):
```
volunteer_score = 0.3×pickup_proximity + 0.3×dropoff_proximity + 0.2×window_fit + 0.2×reliability
```

## Key API routes
| Route | Purpose |
|---|---|
| `POST /api/donations` | Create donation; perishables are matched instantly |
| `POST /api/matches/run` | Batch-match all pending donations |
| `GET /api/matches/:id/volunteer-recommendations` | Ranked volunteer list |
| `PATCH /api/matches/:id/assign-volunteer` | Accept / override volunteer |
| `PATCH /api/matches/:id/status` | matched → picked_up → delivered |
| `GET /api/admin/stats` | Live analytics + unmatched alerts |

## Status flow
`Donated → Matched → Pickup → Delivered` — shown as a visual tracker on donor, NGO and volunteer views, with live countdown timers on perishable items (hackathon differentiator: **urgency-based smart priority matching**).

## NGO live feed & notifications
- **Every donor post fans out instantly** — when a donation is created, *all* active NGOs receive a WhatsApp-stub notification ("🔔 New donation posted: …") before any matching happens
- NGOs see a **live donor-posts feed** (auto-refreshes every 10 s): photos, donor, quantity, location, expiry countdowns — open posts highlighted as "Awaiting AI match"
- **Per-NGO notification feed** (`GET /api/notifications?recipient=<phone>`) with unread badge, toast alerts and "Mark all read" on the NGO dashboard
- The auto-matched NGO gets a dedicated match notification instead of the generic post alert

## Real-time + live map tracking (Socket.io + Leaflet)
- **Socket.io** rooms (`admin`, `ngos`, `donor:<id>`, `ngo:<id>`, `volunteer:<id>`, `match:<id>`) push toast notifications and data-sync events — no page refresh anywhere in the demo
- **Volunteer live tracking**: "Start live tracking" shares browser GPS → position broadcast every 5 s (`POST /api/matches/:id/track`) → stored in `delivery_tracking` history
- **Map view** (Leaflet + OpenStreetMap, no API key): 🚴 volunteer (live), 📍 pickup, 🏠 drop-off, dashed orange leg volunteer→pickup, solid green leg pickup→drop-off, with Haversine distance + ETA per leg and an **"Open in Google Maps"** deep link for real navigation
- **Donor & NGO "Track your delivery"** panels show the volunteer moving in real time (subscribes to the `match:<id>` room)
- **Admin live map** shows all in-flight deliveries at once; admin also gets **⚠️ expiry alerts** (perishable food unmatched & expiring within 20 min, checked every 30 s)
- Notification events: post → NGOs · match → donor + NGO + admin · volunteer accepted → donor + NGO · picked up (ETA) → NGO + donor · delivered → everyone · expiring-unmatched → admin

## Project layout
```
├── client/          # React + Vite + Tailwind SPA
├── server/          # Express API + SQLite + AI engines
└── legacy/          # Original static HTML prototype (kept for reference)
```
