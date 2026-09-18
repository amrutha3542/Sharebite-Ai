import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, setUser, setToken, ROLE_HOME } from '../api';
import { PageHead, Toast, useToast } from '../ui';

const DEMO_PASSWORD = 'demo1234';

const ROLES = [
  ['donor', '🌿', 'Donor', 'I have surplus food to share'],
  ['ngo', '🏠', 'NGO / Beneficiary', 'We feed people in need'],
  ['volunteer', '🚴', 'Volunteer', 'I can pick up and deliver'],
];

const emptyForm = {
  name: '', email: '', phone: '', password: '', role: 'donor',
  address: 'Bengaluru', daily_capacity: 50, need_description: '',
  availability_start: 9, availability_end: 20,
};

export default function Login() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(pathname === '/register' ? 'register' : 'login');
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => { api.get('/auth/users').then(setUsers).catch(() => {}); }, []);
  useEffect(() => { setMode(pathname === '/register' ? 'register' : 'login'); }, [pathname]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const finish = (data) => {
    setToken(data.token);
    setUser(data.user);
    showToast(`Welcome, ${data.user.name}!`);
    setTimeout(() => navigate(ROLE_HOME[data.user.role] || '/'), 400);
  };

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { finish(await api.post('/auth/login', { email: form.email, password: form.password })); }
    catch (err) { showToast(err.message); }
    setBusy(false);
  };

  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { finish(await api.post('/auth/register', form)); }
    catch (err) { showToast(err.message); }
    setBusy(false);
  };

  const demoLogin = async (u) => {
    setBusy(true);
    try { finish(await api.post('/auth/login', { email: u.email, password: DEMO_PASSWORD })); }
    catch (err) { showToast(err.message); }
    setBusy(false);
  };

  return (
    <>
      <PageHead eyebrow="Authentication" title={mode === 'login' ? 'Welcome back.' : 'Join ShareBite AI.'}
        sub={mode === 'login'
          ? 'Sign in to donate food, receive matches or deliver hope.'
          : 'Create an account as a donor, NGO or volunteer — it takes under a minute.'} />
      <section className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[440px_1fr] gap-6 items-start">
        <div className="card">
          {/* ── Tab switcher ── */}
          <div className="grid grid-cols-2 gap-1 bg-soft p-1 rounded-xl mb-5">
            {[['login', 'Sign in'], ['register', 'Create account']].map(([key, label]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`min-h-[36px] rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${mode === key ? 'bg-white shadow text-leafdark' : 'text-moss'}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'login' ? (
            /* ── Sign in form ── */
            <form onSubmit={signIn}>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" placeholder="you@example.com" value={form.email}
                    onChange={(e) => set('email', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" placeholder="••••••••" value={form.password}
                    onChange={(e) => set('password', e.target.value)} required />
                </div>
                <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
              </div>
              <p className="text-[11px] text-moss mt-3 text-center">
                New here?{' '}
                <button type="button" className="text-leafdark font-bold cursor-pointer underline" onClick={() => setMode('register')}>Create an account</button>
              </p>
            </form>
          ) : (
            <RegisterForm form={form} set={set} busy={busy} onSubmit={register} onSwitch={() => setMode('login')} />
          )}
        </div>

        {/* ── One-click demo accounts (hackathon convenience) ── */}
        <div className="card">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Demo accounts</strong>
            <span className="badge bg-lime text-ink">One-click login</span>
          </div>
          <p className="text-[11px] text-moss mt-1">
            Explore instantly with seeded accounts (shared password <code className="bg-soft px-1 rounded">demo1234</code>).
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {users.filter((u) => ['donor', 'ngo', 'volunteer', 'admin'].includes(u.role)).slice(0, 8).map((u) => (
              <button key={u.id} disabled={busy} onClick={() => demoLogin(u)}
                className="border border-line rounded-xl px-3 py-2 text-left cursor-pointer hover:border-leaf transition-colors disabled:opacity-50">
                <strong className="text-xs block">{u.name} <span className="badge bg-mint text-leafdark ml-1">{u.role}</span></strong>
                <span className="text-[10px] text-moss">{u.email}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <Toast message={toast} />
    </>
  );
}

/* ── Registration form with role-specific fields ── */
function RegisterForm({ form, set, busy, onSubmit, onSwitch }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">I am joining as</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[['donor', '🌿', 'Donor'], ['ngo', '🏠', 'NGO'], ['volunteer', '🚴', 'Volunteer']].map(([role, icon, label]) => (
              <button type="button" key={role} onClick={() => set('role', role)}
                className={`rounded-xl border p-2 text-center cursor-pointer transition-colors ${form.role === role ? 'border-leaf bg-mint/50' : 'border-line hover:border-leaf'}`}>
                <div className="text-base">{icon}</div>
                <div className="text-[10px] font-extrabold mt-0.5">{label}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" placeholder="Your name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" placeholder="+91-…" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Email</label>
          <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div className="col-span-2">
          <label className="label">Password (min 6 characters)</label>
          <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6} />
        </div>

        {form.role === 'ngo' && (
          <>
            <div>
              <label className="label">Daily capacity (meals)</label>
              <input className="input" type="number" min="1" value={form.daily_capacity}
                onChange={(e) => set('daily_capacity', e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">What food do you need?</label>
              <input className="input" placeholder="e.g. Cooked meals for evening community kitchen"
                value={form.need_description} onChange={(e) => set('need_description', e.target.value)} />
            </div>
          </>
        )}

        {form.role === 'volunteer' && (
          <>
            <div>
              <label className="label">Available from (hour)</label>
              <input className="input" type="number" min="0" max="23" value={form.availability_start}
                onChange={(e) => set('availability_start', e.target.value)} />
            </div>
            <div>
              <label className="label">Available until (hour)</label>
              <input className="input" type="number" min="0" max="23" value={form.availability_end}
                onChange={(e) => set('availability_end', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Base location</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </>
        )}
      </div>
      <button className="btn-primary w-full mt-4" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      <p className="text-[11px] text-moss mt-3 text-center">
        Already have an account?{' '}
        <button type="button" className="text-leafdark font-bold cursor-pointer underline" onClick={onSwitch}>Sign in</button>
      </p>
    </form>
  );
}
