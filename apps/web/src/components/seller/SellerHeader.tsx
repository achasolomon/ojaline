import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, clearSession } from '../../lib/session';
import { getUnreadCount, subscribeNotifications } from '../../lib/notifications';
import { Icon, type IconName } from '../icons';
import { cn } from '../../lib/cn';

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition hover:bg-gray-100',
        danger && 'text-danger hover:bg-danger/5',
      )}
    >
      <Icon name={icon} size={16} className={danger ? 'text-danger' : 'text-gray-500'} />
      {label}
    </button>
  );
}

/** Custom Seller Centre top bar — brand + notifications, support and account/logout. */
export function SellerHeader() {
  const navigate = useNavigate();
  const user = getUser();
  const [unread, setUnread] = useState(() => getUnreadCount());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeNotifications((list) =>
      setUnread(list.filter((n) => !n.read).length),
    );
    return unsub;
  }, []);

  const initials = (user?.full_name ?? 'S')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const go = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  const logout = () => {
    setMenuOpen(false);
    clearSession();
    navigate('/');
  };

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2.5 sm:h-14 sm:px-4">
      <button
        type="button"
        onClick={() => go('/seller/dashboard')}
        className="flex items-center gap-2 rounded-lg border-none bg-transparent p-0.5 transition hover:bg-gray-50 cursor-pointer sm:-ml-1 sm:p-1"
        aria-label="Seller Centre home"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">O</span>
        <span className="hidden text-sm font-bold text-gray-900 sm:block">Seller Centre</span>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => go('/seller/notifications')}
        className="relative grid h-9 w-9 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        aria-label="Notifications"
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#df3535] px-1 text-[8px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => go('/seller/help')}
        className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 sm:flex"
        aria-label="Help & support"
      >
        <Icon name="help" size={18} />
        <span className="hidden text-[12px] font-semibold lg:inline">Support</span>
      </button>

      <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full p-1 pr-1 cursor-pointer border-none bg-transparent transition hover:bg-gray-100 sm:pr-2"
          aria-label="Account menu"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-light text-[12px] font-bold text-primary">
            {initials}
          </span>
          <span className="hidden max-w-[120px] flex-col items-start lg:flex">
            <span className="max-w-full truncate text-[12px] font-bold text-gray-900">
              {user?.full_name?.split(' ')[0] ?? 'Seller'}
            </span>
            <span className="text-[10px] text-gray-400">Seller</span>
          </span>
          <Icon name="chevronDown" size={14} className="hidden text-gray-500 sm:block" />
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close account menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-30 cursor-default bg-transparent border-none"
            />
            <div className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_12px_32px_rgba(15,48,28,0.12)]">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="truncate text-sm font-bold text-gray-900">{user?.full_name}</p>
                <p className="truncate text-[11px] text-gray-400">{user?.phone ?? user?.email ?? ''}</p>
              </div>
              <div className="p-1.5">
                <MenuItem icon="grid" label="Seller Centre home" onClick={() => go('/seller/dashboard')} />
                <MenuItem icon="user" label="My account" onClick={() => go('/seller/account')} />
                <MenuItem icon="store" label="My storefront" onClick={() => go('/seller/storefront')} />
                <MenuItem icon="help" label="Help & support" onClick={() => go('/seller/help')} />
                <MenuItem icon="shopping-bag" label="Shop the market" onClick={() => go('/')} />
              </div>
              <div className="border-t border-gray-100 p-1.5">
                <MenuItem icon="logout" label="Log out" danger onClick={logout} />
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}