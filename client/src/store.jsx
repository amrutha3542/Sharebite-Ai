import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Senior pattern: one typed store for auth + toasts instead of
 * localStorage reads scattered across pages (Nav, App, Donor...).
 * Backed by localStorage so refresh keeps the session.
 */
const USER_KEY = 'sharebite_ai_user';
const LEGACY_USER_KEY = 'foodshare_ai_user';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(readStoredUser);
  const [notice, setNotice] = useState('');

  const setUser = useCallback((next) => {
    setUserState(next);
    try {
      if (next) { localStorage.setItem(USER_KEY, JSON.stringify(next)); localStorage.removeItem(LEGACY_USER_KEY); }
      else { localStorage.removeItem(USER_KEY); localStorage.removeItem(LEGACY_USER_KEY); }
    } catch { /* storage full / private mode — session just won't persist */ }
  }, []);

  const notify = useCallback((message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 3500);
  }, []);

  const value = useMemo(() => ({ user, setUser, notice, notify }), [user, notice, setUser, notify]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
