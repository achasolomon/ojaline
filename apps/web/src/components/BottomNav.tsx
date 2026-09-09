import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isLoggedIn, AUTH_EVENT } from '../lib/session';

const NAV_ITEMS: { path: string; label: string; icon: string; requiresAuth?: boolean }[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/categories', label: 'Categories', icon: 'categories' },
  { path: '/orders', label: 'Orders', icon: 'orders' },
  { path: '/chat', label: 'Messages', icon: 'messages', requiresAuth: true },
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
            className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 bg-transparent border-none cursor-pointer min-w-[56px] transition ${
              active ? 'text-primary' : 'text-[#8A8A8A]'
            }`}
          >
            <NavIcon icon={item.icon} active={active} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
