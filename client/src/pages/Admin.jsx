import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { PageHead, Countdown, Toast, useToast, ScoreBar } from '../ui';
import LiveMap from '../components/LiveMap';
import { socket } from '../socket';

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [livemap, setLivemap] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const load = async () => {
    setStats(await api.get('/admin/stats'));
    setLivemap(await api.get('/admin/livemap').catch(() => []));
  };
  useEffect(() => {
    load().catch((e) => showToast(e.message));
    const t = setInterval(() => load().catch(() => {}), 15000); // live refresh
    return () => clearInterval(t);
  }, []);

  // Real-time: reload stats + live map instantly on any platform event
  useEffect(() => {
    const events = ['donation:new', 'match:created', 'delivery:accepted', 'delivery:status', 'delivery:location', 'alert'];
    const reload = () => load().catch(() => {});
    events.forEach((e) => socket.on(e, reload));
    return () => events.forEach((e) => socket.off(e, reload));
  }, []);

  const runMatcher = async () => {
    setBusy(true);
    try {
      const res = await api.post('/matches/run', {});
      showToast(res.matched ? `AI matched ${res.matched} donation(s) ⚡` : 'No pending donations to match.');
      await load();
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };

  const resetSeed = async () => {
    setBusy(true);
    try { await api.post('/admin/seed', {}); showToast('Demo data reset.'); await load(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };

  if (!stats) return (
    <><PageHead eyebrow="Admin" title="Platform analytics" />
    <div className="max-w-6xl mx-auto px-6 py-12 text-xs text-moss">Loading live analytics…</div>
    <Toast message={toast} /></>
  );

  const roleCount = (role) => stats.activeUsers.find((r) => r.role === role)?.count || 0;
  const statusCount = (status) => stats.totals.byStatus.find((s) => s.status === status)?.count || 0;

  return (
    <>
      <PageHead eyebrow="Admin dashboard" title="Live platform analytics."
        sub="Refreshes every 15 seconds — rescue rate, unmatched alerts, NGO load and area-wise activity." />
      <section className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
        {/* ── Top stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card"><p className="text-[10px] font-extrabold uppercase tracking-wider text-moss">Food donated</p><strong className="text-2xl block mt-1">{stats.totals.donations}</strong><p className="text-[11px] text-moss">≈ {stats.totals.estimatedKg} kg</p></div>
          <div className="card"><p className="text-[10px] font-extrabold uppercase tracking-wider text-moss">Redistributed</p><strong className="text-2xl block mt-1 text-leafdark">{stats.totals.delivered}</strong><p className="text-[11px] text-moss">≈ {stats.totals.deliveredKg} kg delivered</p></div>
          <div className="card"><p className="text-[10px] font-extrabold uppercase tracking-wider text-moss">Rescue rate</p><strong className="text-2xl block mt-1 text-leafdark">{stats.totals.rescueRate}%</strong><p className="text-[11px] text-moss">{statusCount('matched')} matched · {statusCount('picked_up')} in transit</p></div>
          <div className="card"><p className="text-[10px] font-extrabold uppercase tracking-wider text-moss">Community</p><strong className="text-2xl block mt-1">{roleCount('donor')} · {roleCount('ngo')} · {roleCount('volunteer')}</strong><p className="text-[11px] text-moss">donors · NGOs · volunteers</p></div>
        </div>
        <AdminPanels stats={stats} busy={busy} runMatcher={runMatcher} resetSeed={resetSeed} livemap={livemap} />
      </section>
      <Toast message={toast} />
    </>
  );
}

function AdminPanels({ stats, busy, runMatcher, resetSeed, livemap }) {
  return (
    <>
      {/* ── Live deliveries map (the wow moment) ── */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <strong className="text-sm">🗺️ Live deliveries map</strong>
            <p className="text-[11px] text-moss">Every in-flight delivery — volunteer 🚴 moving live, pickup 📍, drop-off 🏠. Updates push in real time.</p>
          </div>
          <span className="badge bg-mint text-leafdark">{livemap.length} in flight</span>
        </div>
        <div className="mt-3">
          {livemap.length > 0 ? (
            <LiveMap
              height={380}
              deliveries={livemap.map((r) => ({
                pickup: { lat: r.pickup_lat, lng: r.pickup_lng, label: `Pickup: ${r.food_name}` },
                dropoff: { lat: r.dropoff_lat, lng: r.dropoff_lng, label: `Drop-off: ${r.ngo_name}` },
                volunteer: r.current_lat != null
                  ? { lat: r.current_lat, lng: r.current_lng, label: `${r.volunteer_name || 'Volunteer'} · ${r.food_name}` }
                  : null,
              }))}
            />
          ) : (
            <p className="text-xs text-moss py-6 text-center">No deliveries in flight — accept a pickup task as a volunteer and watch it appear here.</p>
          )}
        </div>
      </div>

      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <strong className="text-sm">AI matching engine</strong>
          <p className="text-[11px] text-moss">score = 0.35×urgency + 0.25×distance + 0.25×quantity-fit + 0.15×capacity</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={runMatcher}>{busy ? 'Running…' : 'Run AI matcher'}</button>
          <button className="btn-ghost" disabled={busy} onClick={resetSeed}>Reset demo data</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* ── Unmatched alerts ── */}
        <div className="card">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Pending / unmatched</strong>
            <span className="badge bg-orange-100 text-orange-700">{stats.pendingUnmatched.length} waiting</span>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {stats.pendingUnmatched.length === 0 && <p className="text-xs text-moss">Every donation is matched. ⚡</p>}
            {stats.pendingUnmatched.map((d) => (
              <div key={d.id} className={`rounded-xl border p-3 ${d.flagged ? 'border-orange-300 bg-orange-50' : 'border-line'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <strong className="text-xs">{d.food_name} · {d.quantity} {d.unit}</strong>
                  <Countdown expiry={d.expiry_time} perishable={d.is_perishable} />
                </div>
                <p className="text-[11px] text-moss mt-0.5">{d.address} · waiting {Math.round(d.minutes_waiting)} min{d.flagged && ' · ⚠ needs coordinator attention'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── NGO capacity load ── */}
        <div className="card">
          <strong className="text-sm">NGO capacity load (today)</strong>
          <div className="flex flex-col gap-3 mt-3">
            {stats.ngoLoad.map((n) => (
              <div key={n.name}>
                <ScoreBar label={n.name} score={(n.pct_full || 0) / 100}
                  suffix={`${n.received_today}/${n.daily_capacity} (${n.pct_full || 0}%)`} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Area-wise activity ── */}
        <div className="card">
          <strong className="text-sm">Area-wise activity</strong>
          <table className="w-full text-xs mt-3">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-moss">
              <th className="py-1">Area</th><th>Donations</th><th>Delivered</th><th>≈ kg</th>
            </tr></thead>
            <tbody>
              {stats.areaBreakdown.map((a) => (
                <tr key={a.address} className="border-t border-line">
                  <td className="py-1.5 pr-2">{a.address}</td><td>{a.donations}</td>
                  <td>{a.delivered}</td><td>{Math.round(a.estimated_kg)}</td>
                </tr>
              ))}
              {stats.areaBreakdown.length === 0 && <tr><td colSpan="4" className="text-moss py-2">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* ── WhatsApp notification feed ── */}
        <div className="card">
          <strong className="text-sm">WhatsApp notification feed (stub)</strong>
          <div className="flex flex-col gap-2 mt-3">
            {stats.notifications.length === 0 && <p className="text-xs text-moss">No notifications yet — run the matcher.</p>}
            {stats.notifications.map((n) => (
              <div key={n.id} className="bg-soft rounded-xl px-3 py-2">
                <p className="text-[11px] text-ink/80">💬 {n.message}</p>
                <p className="text-[9px] text-moss mt-0.5">→ {n.recipient} · {n.created_at}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
