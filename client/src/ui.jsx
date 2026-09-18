import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api, getUser, setUser, setToken } from './api';

/* ── Navigation ─────────────────────────────────────────────── */
export function Nav() {
  const user = getUser();
  const navigate = useNavigate();
  const links = [
    ['/', 'Home'], ['/donor', 'Donate'], ['/ngo', 'NGO'],
    ['/volunteer', 'Volunteer'], ['/admin', 'Admin'],
  ];
  return (
    <header className="sticky top-0 z-30 h-[70px] flex items-center border-b border-line/70 bg-white/90 backdrop-blur">
      <div className="w-full max-w-6xl mx-auto px-6 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <span className="w-9 h-9 grid place-items-center text-white bg-leaf rotate-[-8deg] rounded-[11px] rounded-bl-[3px]">🌿</span>
          <span className="rotate-0">ShareBite <span className="text-leaf">AI</span></span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-moss">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'text-leafdark' : 'hover:text-leafdark')}>{label}</NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-moss font-semibold">
                {user.name} · <span className="uppercase text-leafdark">{user.role}</span>
              </span>
              <button className="btn-ghost" onClick={async () => {
                try { await api.post('/auth/logout'); } catch { /* session already gone */ }
                setToken(null); setUser(null); navigate('/');
              }}>Log out</button>
            </>
          ) : (
            <Link className="btn-primary" to="/login">Log in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── Status tracker: Donated → Matched → Pickup → Delivered ── */
const STEPS = [
  ['donated', 'Donated'], ['matched', 'Matched'],
  ['picked_up', 'Pickup'], ['delivered', 'Delivered'],
];

export function StatusTracker({ status }) {
  const activeIndex = STEPS.findIndex(([s]) => s === status);
  return (
    <div className="flex items-center gap-1 w-full">
      {STEPS.map(([key, label], i) => {
        const done = i <= activeIndex;
        return (
          <React.Fragment key={key}>
            {i > 0 && <div className={`h-1 flex-1 rounded ${i <= activeIndex ? 'bg-leaf' : 'bg-line'}`} />}
            <div className="flex flex-col items-center gap-1">
              <span className={`w-4 h-4 rounded-full grid place-items-center text-[8px] text-white ${done ? 'bg-leaf' : 'bg-line'}`}>
                {done ? '✓' : ''}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wide ${done ? 'text-leafdark' : 'text-moss'}`}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Urgency countdown for perishable donations ─────────────── */
export function Countdown({ expiry, perishable }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!perishable || !expiry) return null;
  const left = (new Date(expiry).getTime() - now) / 1000;
  if (left <= 0) return <span className="badge bg-red-100 text-red-700">⏰ Best-before passed</span>;
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
  const critical = left < 3600, soon = left < 3 * 3600;
  return (
    <span className={`badge ${critical ? 'bg-red-100 text-red-700' : soon ? 'bg-orange-100 text-orange-700' : 'bg-mint text-leafdark'}`}>
      ⏱ {h > 0 ? `${h}h ` : ''}{m}m left
    </span>
  );
}

/* ── Labeled score bar (0–1) ────────────────────────────────── */
export function ScoreBar({ label, score, weight, suffix }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between items-baseline">
        <span className="text-moss font-semibold">{label}</span>
        <span className="font-bold text-ink">{suffix || Math.round(score * 100) + '%'}</span>
      </div>
      <div className="h-1.5 bg-line rounded mt-1">
        <div className="h-full bg-leaf rounded" style={{ width: `${Math.max(3, Math.min(100, score * 100))}%` }} />
      </div>
      {weight != null && <div className="text-[9px] text-moss mt-0.5">weight {weight}</div>}
    </div>
  );
}

/* ── Explainable match card ("Matched because: …") ──────────── */
export function MatchReasons({ match }) {
  const b = match?.score_breakdown || {};
  const reasons = [b.urgency, b.distance, b.quantityFit, b.capacity].filter(Boolean).map((x) => x.label);
  if (!reasons.length) return null;
  return (
    <div className="rounded-xl bg-mint/60 border border-line p-3 mt-3">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-leafdark mb-1">Why this match</div>
      <p className="text-xs text-ink/80 leading-relaxed">
        Matched because: {reasons.join(' · ')}
      </p>
      {match.match_score != null && (
        <div className="mt-2">
          <ScoreBar label="AI match score" score={match.match_score} />
        </div>
      )}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub }) {
  return (
    <section className="bg-gradient-to-br from-[#eef8f0] via-[#fffdf8] to-[#eff8f4] border-b border-line">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="text-3xl md:text-4xl mt-2">{title}</h1>
        {sub && <p className="text-moss text-sm mt-1 max-w-xl">{sub}</p>}
      </div>
    </section>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-white text-xs font-bold px-5 py-3 rounded-xl shadow-card">
      {message}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState('');
  const show = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3500); };
  return [message, show];
}
