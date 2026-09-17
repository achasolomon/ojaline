import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { getUser, getUserId } from '../../lib/session';
import { cn } from '../../lib/cn';
import { Icon } from '../icons';
import { SellerHeader } from './SellerHeader';
import { SellerMobileNav } from './SellerMobileNav';

const SELLER_TABS = [
  { to: '/seller/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/seller/orders', label: 'Orders', icon: 'box' },
  { to: '/seller/products', label: 'Products', icon: 'basket' },
  { to: '/seller/crowd', label: 'Crowd sales', icon: 'user' },
  { to: '/seller/payouts', label: 'Payouts', icon: 'card' },
  { to: '/seller/analytics', label: 'Analytics', icon: 'tag' },
  { to: '/seller/returns', label: 'Returns', icon: 'refresh' },
  { to: '/seller/ads', label: 'Ads', icon: 'megaphone' },
  { to: '/seller/negotiations', label: 'Bargaining', icon: 'handshake' },
  { to: '/seller/messages', label: 'Messages', icon: 'message' },
] as const;

/** Desktop: the "Shop" escape back to buyer mode — the only way out of the portal. */
function ShopSwitcherButton() {
  return (
    <NavLink
      to="/"
      className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark"
    >
      <Icon name="shopping-bag" size={16} />
      Shop the market
    </NavLink>
  );
}

/**
 * Seller-first chrome: screen-height shell so the sidebar stays put while the
 * content pane scrolls, plus a custom Seller Centre header (notifications,
 * support, account/logout) and an app-native bottom tab bar on mobile. Only
 * renders for accounts with a seller profile.
 */
export function SellerPortalLayout() {
  const user = getUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!getUserId()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <SellerHeader />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
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
            <ShopSwitcherButton />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden md:p-6">
            <Outlet />
          </main>
          <SellerMobileNav />
        </div>
      </div>
    </div>
  );
}