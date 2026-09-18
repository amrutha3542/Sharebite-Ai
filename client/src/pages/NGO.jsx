import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { PageHead, Countdown, StatusTracker, MatchReasons, Toast, useToast, ScoreBar } from '../ui';
import TrackDelivery from '../components/TrackDelivery';
import { socket, joinRooms, leaveRooms } from '../socket';

const STATUS_RANK = { donated: 0, matched: 1, picked_up: 2, delivered: 3 };

export default function NGO() {
  const [matches, setMatches] = useState([]);
  const [ngos, setNgos] = useState([]);
  const [donations, setDonations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [seenIds, setSeenIds] = useState(() => new Set());
  const knownIds = useRef(new Set());
  const loadedOnce = useRef(false);
  const [toast, showToast] = useToast();

  const selected = ngos.find((n) => n.id === selectedId) || null;

  const load = async () => {
    const [m, n, d] = await Promise.all([api.get('/matches'), api.get('/volunteers/ngos'), api.get('/donations')]);
    setMatches(m);
    setNgos(n);
    setDonations(d);
    setSelectedId((cur) => cur || n[0]?.id || null);
  };

  // Notifications are per-NGO (filtered by the NGO's WhatsApp number)
  const loadNotifications = async () => {
    if (!selected) return;
    const list = await api.get(`/notifications?recipient=${encodeURIComponent(selected.contact_phone)}`);
    const fresh = list.filter((x) => !knownIds.current.has(x.id));
    if (loadedOnce.current && fresh.length > 0) {
      showToast(`🔔 ${fresh.length} new notification${fresh.length > 1 ? 's' : ''} — a donor posted food!`);
    }
    knownIds.current = new Set([...knownIds.current, ...list.map((x) => x.id)]);
    loadedOnce.current = true;
    setNotifications(list);
  };

  useEffect(() => { load().catch((e) => showToast(e.message)); }, []);
  useEffect(() => { loadNotifications().catch(() => {}); }, [selectedId, ngos.length]);

  // Join the specific NGO room for targeted real-time events
  useEffect(() => {
    if (selectedId == null) return;
    const room = `ngo:${selectedId}`;
    joinRooms([room]);
    return () => leaveRooms([room]);
  }, [selectedId]);

  // Real-time: refresh feed the moment a donor posts / matcher runs / status changes
  useEffect(() => {
    const events = ['donation:new', 'match:created', 'delivery:accepted', 'delivery:status'];
    const reload = () => { load().catch(() => {}); loadNotifications().catch(() => {}); };
    events.forEach((e) => socket.on(e, reload));
    return () => events.forEach((e) => socket.off(e, reload));
  }, []);
  // Live: poll for new donor posts + notifications every 10 seconds
  useEffect(() => {
    const t = setInterval(() => {
      load().catch(() => {});
      loadNotifications().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [selectedId, ngos.length]);

  const unread = notifications.filter((x) => !seenIds.has(x.id));
  const markAllRead = () => setSeenIds(new Set(notifications.map((x) => x.id)));

  const capacityPct = (ngo) => Math.min(100, Math.round((ngo.received_today / ngo.daily_capacity) * 100));
  const incoming = matches.filter((m) => m.ngo_id === selectedId);
  // Live donor-post feed: open posts first, then by newest
  const posts = [...donations].sort((a, b) =>
    (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.id - a.id
  );

  return (
    <>
      <PageHead eyebrow="NGO / beneficiary view" title="Live donor posts & matches."
        sub="Every donor post appears here instantly with a notification — the AI matcher then assigns what fits your capacity." />
      <section className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ── NGO selection + capacity ── */}
        <div className="card">
          <strong className="text-sm">Partner NGOs</strong>
          <div className="flex flex-col gap-3 mt-4">
            {ngos.map((n) => (
              <button key={n.id} onClick={() => setSelectedId(n.id)}
                className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${n.id === selectedId ? 'border-leaf bg-mint/50' : 'border-line hover:border-leaf'}`}>
                <strong className="text-xs">{n.name}</strong>
                <p className="text-[10px] text-moss leading-snug mt-0.5">{n.address}</p>
                <div className="mt-2"><ScoreBar label="Capacity today" score={capacityPct(n) / 100}
                  suffix={`${n.received_today}/${n.daily_capacity}`} /></div>
                <p className="text-[10px] text-leafdark mt-1 font-semibold">Needs: {n.need_description}</p>
              </button>
            ))}
          </div>
        </div>

        <NgoMain posts={posts} matches={matches} incoming={incoming} selected={selected}
          notifications={notifications} unread={unread} markAllRead={markAllRead} selectedId={selectedId} />
      </section>
      <Toast message={toast} />
    </>
  );
}

function NgoMain({ posts, matches, incoming, selected, notifications, unread, markAllRead, selectedId }) {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Notification bell / feed (per-NGO) ── */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <strong className="text-sm">🔔 Notifications</strong>
            {unread.length > 0 && <span className="badge bg-red-100 text-red-700">{unread.length} new</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-moss">live · refreshes every 10s</span>
            {unread.length > 0 && (
              <button className="btn-ghost !min-h-[30px] !px-3 !text-[10px]" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-3 max-h-64 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="text-xs text-moss">
              No notifications yet for {selected?.name || 'this NGO'} — post a donation as a donor and it will appear here instantly.
            </p>
          )}
          {notifications.map((n) => (
            <div key={n.id} className={`rounded-xl px-3 py-2 border ${unread.includes(n) ? 'border-leaf/40 bg-mint/40' : 'bg-soft border-transparent'}`}>
              <p className="text-[11px] text-ink/80">{n.message}</p>
              <p className="text-[9px] text-moss mt-0.5">WhatsApp → {n.recipient} · {n.created_at}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live donor posts feed ── */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <strong className="text-sm">Live donor posts {selected && <span className="text-moss font-semibold">· as {selected.name}</span>}</strong>
          <span className="badge bg-mint text-leafdark">{posts.filter((p) => p.status === 'donated').length} open now</span>
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {posts.length === 0 && <div className="card"><p className="text-xs text-moss">No donor posts yet.</p></div>}
          {posts.map((d) => <PostCard key={d.id} d={d} matches={matches} selectedId={selectedId} />)}
        </div>
      </div>

      <IncomingMatches incoming={incoming} />
    </div>
  );
}

function PostCard({ d, matches, selectedId }) {
  const match = matches.find((m) => m.donation_id === d.id);
  const mine = match && match.ngo_id === selectedId;
  return (
    <div className={`card ${d.status === 'donated' ? 'border-2 border-orange-300 bg-orange-50/40' : mine ? 'border-2 border-leaf/40' : 'opacity-80'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {d.photo_url && <img src={d.photo_url} alt="" className="w-14 h-14 object-cover rounded-xl" />}
          <div>
            <strong className="text-xs">{d.food_name}</strong>
            <p className="text-[11px] text-moss">{d.quantity} {d.unit} · donated by {d.donor_name || 'a donor'}</p>
            <p className="text-[11px] text-moss">📍 {d.address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Countdown expiry={d.expiry_time} perishable={d.is_perishable} />
          <span className={`badge ${d.status === 'donated' ? 'bg-orange-100 text-orange-700' : d.status === 'delivered' ? 'bg-line text-moss' : 'bg-mint text-leafdark'}`}>
            {d.status}
          </span>
        </div>
      </div>
      {d.status === 'donated' && (
        <p className="text-[11px] text-orange-700 font-semibold mt-2">
          ⏳ Awaiting AI match — you've been notified. The matcher assigns this to the best-fit NGO (urgency · distance · your capacity).
        </p>
      )}
      {match && !mine && (
        <p className="text-[11px] text-moss mt-2">Assigned to {match.ngo_name} — not this NGO.</p>
      )}
      {mine && (
        <>
          <p className="text-[11px] text-leafdark font-semibold mt-2">✓ Assigned to you · AI fit {Math.round((match.match_score || 0) * 100)}%</p>
          <div className="mt-3"><StatusTracker status={d.status} /></div>
        </>
      )}
    </div>
  );
}

function IncomingMatches({ incoming }) {
  const [trackingId, setTrackingId] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <strong className="text-sm">Incoming matches</strong>
        <span className="badge bg-mint text-leafdark">{incoming.length} assigned</span>
      </div>
      {incoming.length === 0 && (
        <div className="card"><p className="text-xs text-moss">Nothing assigned to this NGO yet — open donor posts above will be matched by the AI engine based on urgency, distance and your capacity.</p></div>
      )}
      {incoming.map((m) => (
        <div key={m.id} className="card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {m.photo_url && <img src={m.photo_url} alt="" className="w-14 h-14 object-cover rounded-xl" />}
              <div>
                <strong className="text-xs">{m.food_name}</strong>
                <p className="text-[11px] text-moss">{m.quantity} {m.unit} · from {m.donor_name}</p>
                <p className="text-[11px] text-moss">Pickup: {m.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Countdown expiry={m.expiry_time} perishable={m.is_perishable} />
              <span className={`badge ${m.status === 'delivered' ? 'bg-line text-moss' : m.status === 'picked_up' ? 'bg-orange-100 text-orange-700' : 'bg-mint text-leafdark'}`}>
                {m.volunteer_name ? `${m.volunteer_name} · ${m.status}` : m.status}
              </span>
            </div>
          </div>
          <MatchReasons match={m} />
          <div className="mt-4"><StatusTracker status={m.status} /></div>
          {['matched', 'picked_up'].includes(m.status) && (
            <>
              <button className="btn-light !min-h-[28px] !px-3 !text-[10px] mt-3"
                onClick={() => setTrackingId((cur) => (cur === m.id ? null : m.id))}>
                📍 {trackingId === m.id ? 'Hide live tracking' : 'Track delivery live'}
              </button>
              {trackingId === m.id && <TrackDelivery matchId={m.id} height={280} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
