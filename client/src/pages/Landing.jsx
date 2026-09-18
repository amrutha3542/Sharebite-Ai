import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const pitch = 'Most food donation platforms coordinate manually — volunteers match donors to NGOs over WhatsApp and phone calls. ShareBite AI automates that decision-making with a weighted scoring engine, so the system scales to more cities and donors without proportionally more human coordinators.';

const features = [
  ['🧠', 'Intelligent batch matching', 'score = w1×urgency + w2×distance + w3×quantity-fit + w4×NGO-capacity — every pending donation scored against all NGOs at once.'],
  ['⏱', 'Urgency-aware redistribution', 'Perishable, cooked food nearing expiry is matched and moved first, with a live countdown so urgency is visible.'],
  ['🚴', 'Volunteer auto-recommendation', 'Ranked by proximity to pickup and drop-off, availability window and past reliability — with manual override.'],
  ['📊', 'Explainable decisions', 'Every match says why: "Matched because: perishable high urgency · 2.3 km away · fits NGO\'s current need".'],
  ['📍', 'Status tracking', 'Donated → Matched → Pickup → Delivered, tracked visually across donor, NGO and volunteer views.'],
  ['📈', 'Admin analytics', 'Live totals, rescue rate, unmatched alerts, area-wise activity and NGO capacity load.'],
];

export default function Landing() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/admin/public-stats').then(setStats).catch(() => {}); }, []);
  const donors = stats?.donors ?? '—';
  const partners = stats?.ngoPartners ?? '—';
  const meals = stats?.mealsRedirected ?? '—';
  const waste = stats ? (stats.wasteKg >= 1000 ? `${stats.wasteT}T` : `${stats.wasteKg}kg`) : '—';
  return (
    <>
      <section className="bg-gradient-to-br from-[#eef8f0] via-[#fffdf8] to-[#eff8f4] relative overflow-hidden">
        <div className="w-full max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-14 items-center relative z-10">
          <div>
            <div className="eyebrow">AI-powered community impact</div>
            <h1 className="text-4xl md:text-6xl mt-4">Match food.<br /><span className="text-leaf">Not messages.</span><br />Feed hope.</h1>
            <p className="text-moss text-sm mt-5 max-w-lg leading-relaxed">{pitch}</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link className="btn-primary" to="/donor">Donate surplus food →</Link>
              <Link className="btn-ghost" to="/login">Explore demo dashboards</Link>
            </div>
          </div>
          <div className="hidden md:flex flex-col gap-4">
            <div className="card flex items-center gap-4 -rotate-1">
              <span className="w-11 h-11 grid place-items-center text-xl bg-mint rounded-xl">🧠</span>
              <div><strong className="text-sm">AI match found</strong><div className="text-xs text-moss">76% fit · Hope Kids Trust · perishable priority</div></div>
            </div>
            <div className="card flex items-center gap-4 rotate-1 ml-8">
              <span className="w-11 h-11 grid place-items-center text-xl bg-mint rounded-xl">🚴</span>
              <div><strong className="text-sm">Ravi recommended</strong><div className="text-xs text-moss">0 km from pickup · 4.8★ · 34 deliveries</div></div>
            </div>
            <div className="card flex items-center gap-4 -rotate-1">
              <span className="w-11 h-11 grid place-items-center text-xl bg-mint rounded-xl">⏱</span>
              <div><strong className="text-sm">1h 42m left</strong><div className="text-xs text-moss">Vegetable pulao · cooked, 40 servings</div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-ink text-white text-[10px] font-extrabold tracking-wider">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap justify-between gap-4">
          <span>BUILT FOR LOCAL IMPACT{stats ? ` · RESCUE RATE ${stats.rescueRate}%` : ''}</span><span>DONORS <strong className="text-lime">{donors}</strong></span>
          <span>NGO PARTNERS <strong className="text-lime">{partners}</strong></span><span>MEALS REDIRECTED <strong className="text-lime">{meals}</strong></span>
          <span>WASTE AVOIDED <strong className="text-lime">{waste}</strong></span>
        </div>
      </div>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="eyebrow">The full flow, automated</div>
        <h2 className="text-2xl md:text-3xl mt-2">From donor upload to NGO delivery — no WhatsApp scramble.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {features.map(([icon, title, copy]) => (
            <div className="card" key={title}>
              <span className="w-10 h-10 grid place-items-center text-lg bg-soft rounded-lg">{icon}</span>
              <h3 className="text-sm mt-3">{title}</h3>
              <p className="text-xs text-moss mt-1 leading-relaxed">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
