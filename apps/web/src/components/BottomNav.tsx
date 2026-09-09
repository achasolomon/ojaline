import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isLoggedIn, AUTH_EVENT } from '../lib/session';
import { useNegotiationCount } from '../lib/negotiation';

const NAV_ITEMS: { path: string; label: string; icon: string; requiresAuth?: boolean }[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/categories', label: 'Categories', icon: 'categories' },
  { path: '/crowd-market', label: 'Crowd', icon: 'megaphone' },
  { path: '/orders', label: 'Orders', icon: 'orders' },
  { path: '/chat', label: 'Messages', icon: 'messages', requiresAuth: true },
  { path: '/negotiations', label: 'Haggling', icon: 'handshake', requiresAuth: true },
  { path: '/account', label: 'Account', icon: 'account' },
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = active ? 'stroke-primary' : 'stroke-current';

  if (icon === 'home') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <path d="M9 22V12h6v10"/>
      </svg>
    );
  }
  if (icon === 'categories') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    );
  }
  if (icon === 'orders') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
      </svg>
    );
  }
  if (icon === 'messages') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    );
  }
  if (icon === 'megaphone') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <path d="M3 11l18-5v12L3 13v-2z"/>
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
      </svg>
    );
  }
  if (icon === 'handshake') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
        <path d="m11 17 2 2a1 1 0 1 0 3-3"/>
        <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>
        <path d="m21 3 1 11h-2"/>
        <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/>
        <path d="M3 4h8"/>
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={cls} strokeWidth={active ? 2.5 : 2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const haggleCount = useNegotiationCount();

  useEffect(() => {
    const onAuth = () => setAuthed(isLoggedIn());
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="flex items-center border-t border-border bg-white px-2 py-1.5 safe-area-pb shrink-0">
      {NAV_ITEMS.filter((item) => !item.requiresAuth || authed).map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 bg-transparent border-none cursor-pointer min-w-[56px] transition ${
              active ? 'text-primary' : 'text-[#8A8A8A]'
            }`}
          >
            <NavIcon icon={item.icon} active={active} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {item.label}
            </span>
            {item.icon === 'handshake' && haggleCount > 0 && (
              <span className="absolute top-0 right-[calc(50%-26px)] min-w-4 h-4 rounded-full bg-[#F5A623] text-[#4A2D00] text-[9px] font-bold flex items-center justify-center px-1 leading-none">
                {haggleCount > 99 ? '99+' : haggleCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
