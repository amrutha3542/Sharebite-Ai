import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Nav } from './ui';
import { getUser } from './api';
import { ROLE_HOME } from './api';
import { socket, joinRooms } from './socket';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Donor from './pages/Donor';
import NGO from './pages/NGO';
import Volunteer from './pages/Volunteer';
import Admin from './pages/Admin';

/** Global real-time toast host — server already filters per room, no page refresh needed. */
function RealtimeToastHost() {
  const [toasts, setToasts] = useState([]);
  const location = useLocation();

  useEffect(() => {
    const user = getUser();
    const rooms =
      user?.role === 'admin' ? ['admin']
      : user?.role === 'ngo' ? ['ngos']
      : user?.role === 'donor' ? [`donor:${user.id}`]
      : user?.role === 'volunteer' ? [`volunteer:${user.id}`]
      : [];
    if (rooms.length) joinRooms(rooms);

    const onToast = (t) => {
      const id = Math.random();
      setToasts((cur) => [...cur, { id, message: t.message }]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 7000);
    };
    const onAlert = (a) => onToast(a);
    socket.on('toast', onToast);
    socket.on('alert', onAlert);
    return () => {
      socket.off('toast', onToast);
      socket.off('alert', onAlert);
    };
  }, [location.pathname]);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div key={t.id} className="bg-ink text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-card border border-lime/40 animate-pulse">
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* Route guard: redirect to /login when no session (all logged-in roles can view all pages for demo) */
function RequireAuth({ children }) {
  const user = getUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login />} />
          <Route path="/donor" element={<RequireAuth><Donor /></RequireAuth>} />
          <Route path="/ngo" element={<RequireAuth><NGO /></RequireAuth>} />
          <Route path="/volunteer" element={<RequireAuth><Volunteer /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        </Routes>
      </main>
      <RealtimeToastHost />
      <footer className="border-t border-line py-6 text-center text-xs text-moss">
        <strong>ShareBite AI</strong> · AI-based surplus food redistribution · college project demo
      </footer>
    </div>
  );
}
