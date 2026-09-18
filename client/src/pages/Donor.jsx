import React, { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { PageHead, Countdown, StatusTracker, MatchReasons, Toast, useToast, ScoreBar } from '../ui';
import TrackDelivery from '../components/TrackDelivery';
import { socket } from '../socket';

const DEFAULT_LOC = { lat: 12.9352, lng: 77.6245 }; // Koramangala, Bengaluru — demo default

const emptyForm = {
  food_name: '', food_type: 'Cooked meals', quantity: '', unit: 'servings',
  is_perishable: true, expiry_hours: 2, address: 'Koramangala 5th Block, Bengaluru', photo_url: '',
};

export default function Donor() {
  const user = getUser();
  const [form, setForm] = useState(emptyForm);
  const [donations, setDonations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [lastMatch, setLastMatch] = useState(null);
  const [recs, setRecs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [toast, showToast] = useToast();

  const load = async () => {
    const [d, m] = await Promise.all([api.get('/donations'), api.get('/matches')]);
    setDonations(d);
    setMatches(m);
  };

  useEffect(() => { load().catch((e) => showToast(e.message)); }, []);

  // Real-time: refresh when the AI matches / volunteer accepts / status changes / cancel
  useEffect(() => {
    const events = ['match:created', 'delivery:accepted', 'delivery:status', 'donation:cancelled'];
    const reload = () => load().catch(() => {});
    events.forEach((e) => socket.on(e, reload));
    return () => events.forEach((e) => socket.off(e, reload));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const donorId = user?.role === 'donor' ? user.id : null;
  const myDonations = donorId ? donations.filter((d) => d.donor_id === donorId || d.donor_name === user.name) : donations;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const perishable = form.is_perishable;
      const expiry = new Date(Date.now() + Number(form.expiry_hours || 2) * 3.6e6).toISOString();
      const res = await api.post('/donations', {
        donor_id: donorId, donor_name: user?.name || 'Demo Donor',
        food_name: form.food_name, food_type: form.food_type,
        quantity: Number(form.quantity), unit: form.unit,
        is_perishable: perishable, expiry_time: expiry,
        lat: DEFAULT_LOC.lat, lng: DEFAULT_LOC.lng, address: form.address,
        photo_url: form.photo_url || null,
      });
      setForm(emptyForm);
      showToast(perishable ? 'Posted! Perishable food was matched instantly.' : 'Posted — queued for the next matching run.');
      if (res.match) {
        setLastMatch(res.match);
        setRecs(await api.get(`/matches/${res.match.id}/volunteer-recommendations`));
      } else { setLastMatch(null); setRecs([]); }
      await load();
    } catch (err) { showToast(err.message); }
    setBusy(false);
  };

  const cancelDonation = async (id) => {
    if (!window.confirm('Cancel this donation? NGOs will no longer see it.')) return;
    setCancellingId(id);
    try {
      await api.patch(`/donations/${id}/cancel`, {});
      showToast('Donation cancelled.');
      await load();
    } catch (err) { showToast(err.message); }
    setCancellingId(null);
  };

  return (
    <>
      <PageHead eyebrow="Donor workspace" title="Put your surplus to work."
        sub="List what you have. Perishable food is matched to the best NGO the moment you post it." />
      <section className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* ── Donation form ── */}
        <form className="card" onSubmit={submit}>
          <strong className="text-sm">New donation</strong>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="col-span-2">
              <label className="label">Food name</label>
              <input className="input" placeholder="e.g. Vegetable biryani" value={form.food_name} onChange={(e) => set('food_name', e.target.value)} required />
            </div>
            <div>
              <label className="label">Food type</label>
              <select className="input" value={form.food_type} onChange={(e) => set('food_type', e.target.value)}>
                {['Cooked meals', 'Bakery', 'Fruits & vegetables', 'Packaged goods'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {['servings', 'kg'].map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" min="1" placeholder="e.g. 25" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required />
            </div>
            <div>
              <label className="label">{form.is_perishable ? 'Shelf life (hours)' : 'Best before (hours)'}</label>
              <input className="input" type="number" min="0.5" step="0.5" value={form.expiry_hours} onChange={(e) => set('expiry_hours', e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="label">Pickup location</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} required />
              <p className="text-[10px] text-moss mt-1">📍 Demo map default: 12.9352, 77.6245 (Koramangala)</p>
            </div>
            <div className="col-span-2 flex items-center justify-between bg-soft rounded-xl px-3 py-2.5">
              <div>
                <strong className="text-xs">Perishable / cooked food</strong>
                <p className="text-[10px] text-moss">2–3 hr shelf life → instant AI matching</p>
              </div>
              <button type="button" role="switch" aria-checked={form.is_perishable}
                className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${form.is_perishable ? 'bg-leaf' : 'bg-line'}`}
                onClick={() => set('is_perishable', !form.is_perishable)}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${form.is_perishable ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="col-span-2">
              <label className="label">Photo URL (optional)</label>
              <input className="input" placeholder="https://…" value={form.photo_url} onChange={(e) => set('photo_url', e.target.value)} />
            </div>
          </div>
          <button className="btn-primary w-full mt-4" disabled={busy}>{busy ? 'Posting…' : 'Donate food'}</button>
          <p className="text-[10px] text-moss mt-2">🛡 Expired perishables are blocked automatically (food-safety guard).</p>
        </form>
        <DonorSide lastMatch={lastMatch} recs={recs} matches={matches} myDonations={myDonations} onCancel={cancelDonation} cancellingId={cancellingId} />
      </section>
      <Toast message={toast} />
    </>
  );
}

function DonorSide({ lastMatch, recs, matches, myDonations, onCancel, cancellingId }) {
  const [trackingId, setTrackingId] = useState(null);
  return (
    <div className="flex flex-col gap-6">
      {lastMatch && (
        <div className="card border-2 border-leaf/40">
          <div className="flex items-center justify-between">
            <strong className="text-sm text-leafdark">⚡ Matched instantly</strong>
            <Countdown expiry={lastMatch.expiry_time} perishable={lastMatch.is_perishable} />
          </div>
          <p className="text-xs text-moss mt-1">
            {lastMatch.quantity} {lastMatch.unit} of {lastMatch.food_name} → {lastMatch.ngo_name}
          </p>
          <MatchReasons match={lastMatch} />
          {recs.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-moss mb-2">Recommended volunteers</div>
              <div className="flex flex-col gap-2">
                {recs.slice(0, 2).map((r) => (
                  <div key={r.volunteer.id} className="flex items-center gap-3 bg-soft rounded-xl px-3 py-2">
                    <span className="w-8 h-8 grid place-items-center bg-mint rounded-lg text-sm">🚴</span>
                    <div className="flex-1">
                      <strong className="text-xs">{r.volunteer.name}</strong>
                      {r === recs[0] && <span className="badge bg-lime text-ink ml-1">Best fit</span>}
                      <div className="text-[10px] text-moss">{r.breakdown.pickupProximity.label} · {r.breakdown.reliability.label}</div>
                    </div>
                    <div className="w-20"><ScoreBar label="" score={r.score} suffix={`${Math.round(r.score * 100)}%`} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <strong className="text-sm">My donations</strong>
        <div className="flex flex-col gap-4 mt-4">
          {myDonations.length === 0 && <p className="text-xs text-moss">No donations yet — post your first surplus on the left.</p>}
          {myDonations.map((d) => {
            const match = matches.find((m) => m.donation_id === d.id);
            return (
              <div key={d.id} className="border border-line rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <strong className="text-xs">{d.food_name}</strong>
                  <div className="flex items-center gap-2">
                    <Countdown expiry={d.expiry_time} perishable={d.is_perishable} />
                    <span className={`badge ${d.status === 'delivered' ? 'bg-line text-moss' : 'bg-mint text-leafdark'}`}>{d.status}</span>
                  </div>
                </div>
                <p className="text-[11px] text-moss mt-0.5">{d.quantity} {d.unit} · {d.address} · {match ? `→ ${match.ngo_name}` : d.status === 'cancelled' ? 'cancelled by you' : 'awaiting match'}</p>
                <div className="mt-3"><StatusTracker status={d.status} /></div>
                {d.status === 'donated' && !match && (
                  <button className="btn-ghost !min-h-[28px] !px-3 !text-[10px] mt-2"
                    disabled={cancellingId === d.id} onClick={() => onCancel(d.id)}>
                    {cancellingId === d.id ? 'Cancelling…' : 'Cancel donation'}
                  </button>
                )}
                {match && ['matched', 'picked_up'].includes(d.status) && (
                  <>
                    <button className="btn-light !min-h-[28px] !px-3 !text-[10px] mt-2"
                      onClick={() => setTrackingId((cur) => (cur === match.id ? null : match.id))}>
                      📍 {trackingId === match.id ? 'Hide live tracking' : 'Track your delivery'}
                    </button>
                    {trackingId === match.id && <TrackDelivery matchId={match.id} height={260} />}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
