import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { getUser, getUserId } from '../../lib/session';
import { cn } from '../../lib/cn';
import { Icon } from '../icons';

const SELLER_TABS = [
  { to: '/home', label: 'Dashboard', icon: 'home' },
  { to: '/seller/orders', label: 'Orders', icon: 'package' },
  { to: '/seller/products', label: 'Products', icon: 'boxes' },
  { to: '/seller/crowd', label: 'Crowd sales', icon: 'users' },
  { to: '/payouts', label: 'Payouts', icon: 'wallet' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
] as const;

/** Seller-first chrome: only renders for accounts with a seller profile. */
export function SellerPortalLayout() {
  const user = getUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!getUserId()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">O</span>
          <span className="text-sm font-bold">Seller Centre</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {SELLER_TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  isActive && 'bg-primary/10 text-primary',
                )
              }
            >
              <Icon name={t.icon} className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <p className="truncate text-[11px] text-gray-400">{user.full_name}</p>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <div className="flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 pt-2 md:hidden">
          {SELLER_TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-gray-500',
                  isActive && 'border-primary text-primary',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
