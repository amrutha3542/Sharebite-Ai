import React, { useEffect, useRef, useState } from 'react';
import { api, getUser } from '../api';
import { PageHead, Countdown, StatusTracker, Toast, useToast, ScoreBar } from '../ui';
import LiveMap from '../components/LiveMap';
import { socket } from '../socket';

export default function Volunteer() {
  const user = getUser();
  const [matches, setMatches] = useState([]);
  const [recommendations, setRecommendations] = useState({}); // matchId → ranked list
  const [busyId, setBusyId] = useState(null);
  const [toast, showToast] = useToast();

  const load = async () => {
    const [m] = await Promise.all([api.get('/matches')]);
    setMatches(m);
    // Fetch ranked volunteers for every match still missing one
    const open = m.filter((x) => !x.volunteer_id && x.status === 'matched');
    const recs = await Promise.all(open.map(async (x) => [x.id, await api.get(`/matches/${x.id}/volunteer-recommendations`)]));
    setRecommendations(Object.fromEntries(recs));
  };

  useEffect(() => { load().catch((e) => showToast(e.message)); }, []);

  // Real-time: refresh the task board the moment anything changes anywhere
  useEffect(() => {
    const events = ['match:created', 'delivery:accepted', 'delivery:status'];
    const reload = () => load().catch(() => {});
    events.forEach((e) => socket.on(e, reload));
    return () => events.forEach((e) => socket.off(e, reload));
  }, []);

  const accept = async (matchId, volunteerId) => {
    setBusyId(matchId);
    try {
      await api.patch(`/matches/${matchId}/assign-volunteer`, { volunteer_id: volunteerId });
      showToast('Task accepted — WhatsApp pickup details sent.');
      await load();
    } catch (e) { showToast(e.message); }
    setBusyId(null);
  };

  const updateStatus = async (matchId, status) => {
    setBusyId(matchId);
    try {
      await api.patch(`/matches/${matchId}/status`, { status });
      showToast(status === 'picked_up' ? 'Marked picked up 📦' : 'Delivered — thank you! ❤️');
      await load();
    } catch (e) { showToast(e.message); }
    setBusyId(null);
  };

  const myName = user?.role === 'volunteer' ? user.name : null;
  const myTasks = myName ? matches.filter((m) => m.volunteer_name === myName && m.status !== 'delivered') : [];
  const openTasks = matches.filter((m) => !m.volunteer_id && m.status === 'matched');
  const inFlight = matches.filter((m) => m.volunteer_id && m.status !== 'delivered');
  const [routeOpenId, setRouteOpenId] = useState(null);


  return (
    <>
      <PageHead eyebrow="Volunteer view" title="Move food where it matters."
        sub="The AI recommends the best-fit volunteer per task — accept a recommendation or update delivery status." />
      <section className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-2 gap-6 items-start">
        {/* ── Open tasks with AI recommendations ── */}
        <div className="flex flex-col gap-4">
          <strong className="text-sm">Open tasks · AI recommendations</strong>
          {openTasks.length === 0 && <div className="card"><p className="text-xs text-moss">No open tasks — every matched donation has a volunteer. 🎉</p></div>}
          {openTasks.map((m) => {
            const recs = recommendations[m.id] || [];
            return (
              <div key={m.id} className="card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <strong className="text-xs">{m.food_name}</strong>
                    <p className="text-[11px] text-moss">{m.quantity} {m.unit} · {m.pickup_address}</p>
                    <p className="text-[11px] text-moss">→ {m.ngo_name}, {m.dropoff_address}</p>
                  </div>
                  <Countdown expiry={m.expiry_time} perishable={m.is_perishable} />
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  {recs.slice(0, 3).map((r, i) => (
                    <div key={r.volunteer.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i === 0 ? 'bg-mint/60 border border-leaf/30' : 'bg-soft'}`}>
                      <span className="w-8 h-8 grid place-items-center bg-white rounded-lg text-sm">🚴</span>
                      <div className="flex-1">
                        <strong className="text-xs">{r.volunteer.name}</strong>
                        {i === 0 && <span className="badge bg-lime text-ink ml-1">Best fit</span>}
                        <div className="text-[10px] text-moss">
                          {r.breakdown.pickupProximity.label} · {r.breakdown.reliability.label}
                        </div>
                      </div>
                      <div className="w-16"><ScoreBar label="" score={r.score} suffix={`${Math.round(r.score * 100)}%`} /></div>
                      <button className="btn-light !min-h-[32px] !px-3" disabled={busyId === m.id} onClick={() => accept(m.id, r.volunteer.id)}>Accept</button>
                    </div>
                  ))}
                  {recs.length === 0 && <p className="text-[11px] text-moss">No available volunteers right now.</p>}
                </div>
                <button className="btn-ghost !min-h-[30px] !px-3 !text-[10px] mt-3"
                  onClick={() => setRouteOpenId((cur) => (cur === m.id ? null : m.id))}>
                  🗺️ {routeOpenId === m.id ? 'Hide route map' : 'View route map (pickup → drop-off)'}
                </button>
                {routeOpenId === m.id && <LiveTracking matchId={m.id} preview />}
              </div>
            );
          })}
        </div>
        <VolunteerSide matches={matches} myTasks={myTasks} inFlight={inFlight} busyId={busyId} updateStatus={updateStatus} />
      </section>
      <Toast message={toast} />
    </>
  );
}

function VolunteerSide({ matches, myTasks, inFlight, busyId, updateStatus }) {
  const user = getUser();
  return (
    <div className="flex flex-col gap-4">
      {myTasks.length > 0 && (
        <div className="card border-2 border-leaf/40">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <strong className="text-sm">My accepted tasks {user?.role === 'volunteer' && user.name}</strong>
            <span className="badge bg-mint text-leafdark">🗺️ map below every task</span>
          </div>
          {myTasks.map((m) => (
            <div key={m.id} className="border-t border-line mt-3 pt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <strong className="text-xs">{m.food_name} · {m.quantity} {m.unit}</strong>
                <Countdown expiry={m.expiry_time} perishable={m.is_perishable} />
              </div>
              <p className="text-[11px] text-moss">{m.pickup_address} → {m.ngo_name}, {m.dropoff_address}</p>
              <div className="mt-3"><StatusTracker status={m.status} /></div>
              <LiveTracking matchId={m.id} />
              <div className="flex gap-2 mt-3">
                {m.status === 'matched' && <button className="btn-primary" disabled={busyId === m.id} onClick={() => updateStatus(m.id, 'picked_up')}>Mark picked up</button>}
                {m.status === 'picked_up' && <button className="btn-primary" disabled={busyId === m.id} onClick={() => updateStatus(m.id, 'delivered')}>Mark delivered</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <strong className="text-sm">In-flight deliveries</strong>
          <span className="badge bg-soft text-moss border border-line">🗺️ tap a delivery to track</span>
        </div>
        <div className="flex flex-col gap-3 mt-4">
          {inFlight.length === 0 && <p className="text-xs text-moss">Nothing in flight right now.</p>}
          {inFlight.map((m) => (
            <InFlightCard key={m.id} m={m} busyId={busyId} updateStatus={updateStatus} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InFlightCard({ m, busyId, updateStatus }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <strong className="text-xs">{m.food_name} · {m.quantity} {m.unit}</strong>
                <span className={`badge ${m.status === 'picked_up' ? 'bg-orange-100 text-orange-700' : 'bg-mint text-leafdark'}`}>
                  {m.volunteer_name} · {m.status}
                </span>
              </div>
              <p className="text-[11px] text-moss mt-0.5">{m.pickup_address} → {m.ngo_name}</p>
              <div className="mt-2"><StatusTracker status={m.status} /></div>
              <button className="btn-light !min-h-[30px] !px-3 !text-[10px] mt-2"
                onClick={() => setOpen((o) => !o)}>
                🗺️ {open ? 'Hide live map' : 'View live map'}
              </button>
              {open && <LiveTracking matchId={m.id} />}
              <div className="flex gap-2 mt-2">
                {m.status === 'matched' && <button className="btn-ghost !min-h-[32px]" disabled={busyId === m.id} onClick={() => updateStatus(m.id, 'picked_up')}>Picked up</button>}
                {m.status === 'picked_up' && <button className="btn-ghost !min-h-[32px]" disabled={busyId === m.id} onClick={() => updateStatus(m.id, 'delivered')}>Delivered</button>}
              </div>
    </div>
  );
}

/* ── Volunteer live tracking: share GPS, see route + ETA, navigate ── */
function LiveTracking({ matchId, preview = false }) {
  const [tracking, setTracking] = useState(false);
  const [pos, setPos] = useState(null);
  const [legs, setLegs] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [error, setError] = useState('');
  const watchRef = useRef(null);
  const lastSent = useRef(0);

  const loadSnapshot = async () => {
    try {
      const d = await api.get(`/matches/${matchId}/tracking`);
      setPickup(d.match?.pickup || null);
      setDropoff(d.match?.dropoff || null);
      setLegs(d.legs || null);
    } catch { /* ignore */ }
  };

  const stop = () => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    setTracking(false);
  };

  const start = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported in this browser.'); return; }
    setError('');
    setTracking(true);
    loadSnapshot();
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(coords);
        const now = Date.now();
        if (now - lastSent.current > 5000) { // throttle: broadcast every 5s
          lastSent.current = now;
          api.post(`/matches/${matchId}/track`, coords)
            .then((r) => setLegs(r.legs || legs))
            .catch(() => {});
        }
      },
      (err) => { setError(`Location error: ${err.message}`); setTracking(false); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  };

  useEffect(() => () => stop(), [matchId]);

  // Load the route (pickup → drop-off) immediately so the map is visible
  // even before the volunteer starts sharing GPS
  useEffect(() => { loadSnapshot(); }, [matchId]);

  const gmapsLink = pos && dropoff && pickup
    ? `https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lng}` +
      `&destination=${dropoff.lat},${dropoff.lng}&waypoints=${pickup.lat},${pickup.lng}&travelmode=driving`
    : null;

  return (
    <div className="mt-3 rounded-xl bg-soft p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <strong className="text-xs">🛰️ {preview ? 'Route preview' : 'Live tracking'} {tracking && <span className="badge bg-red-100 text-red-700 ml-1">● sharing GPS</span>}</strong>
        {preview
          ? <span className="text-[10px] text-moss">Accept this task to go live</span>
          : tracking
            ? <button className="btn-ghost !min-h-[30px] !px-3 !text-[10px]" onClick={stop}>Stop</button>
            : <button className="btn-light !min-h-[30px] !px-3 !text-[10px]" onClick={start}>Start live tracking</button>}
      </div>
      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
      {(pickup || dropoff) && (
        <div className="mt-2">
          <LiveMap
            pickup={pickup}
            dropoff={dropoff}
            volunteer={pos ? { ...pos, label: 'You (live)' } : null}
            height={260}
          />
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {legs?.toPickup && <span className="badge bg-mint text-leafdark">→ Pickup: {legs.toPickup.km} km · ~{legs.toPickup.etaMin} min</span>}
            {legs?.toDropoff && <span className="badge bg-mint text-leafdark">→ Drop-off: {legs.toDropoff.km} km · ~{legs.toDropoff.etaMin} min</span>}
            {gmapsLink && (
              <a href={gmapsLink} target="_blank" rel="noreferrer" className="btn-dark !min-h-[28px] !px-3 !text-[10px]">
                Open in Google Maps ↗
              </a>
            )}
          </div>
          <p className="text-[10px] text-moss mt-1">
            {tracking
              ? 'Your position broadcasts every 5 s — donor and NGO watch it move live.'
              : preview
                ? 'Map shows the pickup → drop-off route. Accept the task, then start live tracking to share your GPS.'
                : 'Click "Start live tracking" to share your live GPS position with the donor and NGO.'}
          </p>
        </div>
      )}
      {!tracking && !pickup && <p className="text-[10px] text-moss mt-1">Start tracking to share your live position with the donor and NGO.</p>}
    </div>
  );
}
