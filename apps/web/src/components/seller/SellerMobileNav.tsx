import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../icons';
import { cn } from '../../lib/cn';
import { getUserId } from '../../lib/session';
import { listSellerOrders } from '../../lib/api';

type Sheet = 'more' | 'add' | null;

function SheetRow({
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
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-[13px] font-semibold text-gray-700 transition active:bg-gray-100',
        danger && 'text-red-600',
      )}
    >
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500',
          danger && 'bg-red-50 text-red-500',
        )}
      >
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon name="chevronRight" size={14} className="shrink-0 text-gray-300" />
    </button>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-1">
      <p className="px-2.5 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">{title}</p>
      <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-1">{children}</div>
    </section>
  );
}

/**
 * App-native bottom tab bar for sellers: Overview/Orders/Crowd around a raised
 * "Add" action, plus a More sheet exposing the full Seller Centre menu — the
 * marketplace-consistent shell hidden on md+ where the sidebar takes over.
 */
export function SellerMobileNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const sellerId = getUserId();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needsAction, setNeedsAction] = useState(0);

  useEffect(() => {
    if (!sellerId) return;
    let alive = true;
    const load = async () => {
      try {
        const page = await listSellerOrders(sellerId, { lineStatus: 'PAID', limit: 1 });
        if (alive) setNeedsAction(page.total);
      } catch {
        /* offline — keep last count */
      }
    };
    void load();
    const timer = window.setInterval(load, 25000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sellerId]);

  useEffect(() => setSheet(null), [loc.pathname]);

  const p = loc.pathname;
  const active = {
    overview: p === '/seller' || p.startsWith('/seller/dashboard'),
    orders: p.startsWith('/seller/orders'),
    crowd: p.startsWith('/seller/crowd'),
  };
  const moreActive = p.startsWith('/seller') && !active.overview && !active.orders && !active.crowd;

  const closeTo = (to: string) => {
    setSheet(null);
    nav(to);
  };

  const go = (to: string) => {
    setSheet(null);
    nav(to);
  };

  const pill = 'grid h-7 w-12 place-items-center rounded-full transition-colors';
  const label = 'text-[10px] font-medium';

  return (
    <>
      <nav className="flex shrink-0 items-stretch border-t border-gray-200 bg-white pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
        <NavLink
          to="/seller/dashboard"
          end
          className={cn('flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-1', active.overview ? 'text-primary' : 'text-gray-400')}
        >
          <span className={cn(pill, active.overview && 'bg-primary/10')}>
            <Icon name="grid" size={20} className={active.overview ? 'text-primary' : 'text-gray-400'} />
          </span>
          <span className={cn(label, active.overview && 'font-semibold')}>Overview</span>
        </NavLink>

        <NavLink
          to="/seller/orders"
          className={cn('flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-1', active.orders ? 'text-primary' : 'text-gray-400')}
        >
          <span className={cn('relative', pill, active.orders && 'bg-primary/10')}>
            <Icon name="box" size={20} className={active.orders ? 'text-primary' : 'text-gray-400'} />
            {needsAction > 0 && (
              <span className="absolute -right-1 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#df3535] px-1 text-[9px] font-black leading-none text-white">
                {needsAction > 99 ? '99+' : needsAction}
              </span>
            )}
          </span>
          <span className={cn(label, active.orders && 'font-semibold')}>Orders</span>
        </NavLink>

        <button
          type="button"
          aria-label="Add"
          onClick={() => setSheet('add')}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
        >
          <span className="-mt-6 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-[0_8px_18px_rgba(34,163,74,0.38)] transition active:scale-90">
            <Icon name="plus" size={22} />
          </span>
          <span className={cn(label, 'pb-1 text-gray-400')}>Add</span>
        </button>

        <NavLink
          to="/seller/crowd"
          className={cn('flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-1', active.crowd ? 'text-primary' : 'text-gray-400')}
        >
          <span className={cn(pill, active.crowd && 'bg-primary/10')}>
            <Icon name="megaphone" size={20} className={active.crowd ? 'text-primary' : 'text-gray-400'} />
          </span>
          <span className={cn(label, active.crowd && 'font-semibold')}>Crowd</span>
        </NavLink>

        <button
          type="button"
          aria-label="More"
          onClick={() => setSheet('more')}
          className={cn('flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-1', moreActive ? 'text-primary' : 'text-gray-400')}
        >
          <span className={cn(pill, moreActive && 'bg-primary/10')}>
            <Icon name="menu" size={20} className={moreActive ? 'text-primary' : 'text-gray-400'} />
          </span>
          <span className={cn(label, moreActive && 'font-semibold')}>More</span>
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSheet(null)}
            className="animate-fade-in absolute inset-0 cursor-default border-none bg-black/40"
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 max-h-[84dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_48px_rgba(0,0,0,0.22)]">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-200" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-gray-900">{sheet === 'more' ? 'Seller menu' : 'Add to your store'}</h2>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {sheet === 'more' ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => closeTo('/')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[13px] font-bold text-white transition active:bg-primary/90"
                >
                  <Icon name="shopping-bag" size={17} />
                  Shop the market
                </button>

                <SheetSection title="Business">
                  <SheetRow icon="basket" label="Manage products" onClick={() => go('/seller/products')} />
                  <SheetRow icon="card" label="Payouts & bank details" onClick={() => go('/seller/payouts')} />
                  <SheetRow icon="tag" label="Sales analytics" onClick={() => go('/seller/analytics')} />
                  <SheetRow icon="megaphone" label="Run an ad" onClick={() => go('/seller/ads')} />
                </SheetSection>

                <SheetSection title="Selling">
                  <SheetRow icon="handshake" label="Bargaining" onClick={() => go('/seller/negotiations')} />
                  <SheetRow icon="message" label="Messages" onClick={() => go('/seller/messages')} />
                  <SheetRow icon="refresh" label="Returns & disputes" onClick={() => go('/seller/returns')} />
                </SheetSection>

                <SheetSection title="Account">
                  <SheetRow icon="store" label="My storefront" onClick={() => go('/seller/storefront')} />
                  <SheetRow icon="settings" label="Storefront look" onClick={() => go('/seller/appearance')} />
                  <SheetRow icon="user" label="My account" onClick={() => go('/seller/account')} />
                  <SheetRow icon="help" label="Help & support" onClick={() => go('/seller/help')} />
                  <SheetRow icon="logout" label="Log out" danger onClick={() => closeTo('/logout')} />
                </SheetSection>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <SheetRow icon="basket" label="Add a new product" onClick={() => go('/seller/products/new')} />
                <SheetRow icon="megaphone" label="Launch a crowd sale" onClick={() => go('/seller/crowd')} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}