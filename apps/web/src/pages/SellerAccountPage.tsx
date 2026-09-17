import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStorefront, type Seller } from '../lib/api';
import { getUser, getUserId, clearSession } from '../lib/session';
import { Icon, type IconName } from '../components/icons';

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmer',
  MARKET_WOMAN: 'Market Woman',
  STORE: 'Store',
  PROCESSOR: 'Processor',
};

interface StatTile {
  icon: IconName;
  label: string;
  value: string;
}

function buildStats(seller: Seller): StatTile[] {
  const tiles: StatTile[] = [];
  if (seller.avg_rating != null) {
    const rating = Number(seller.avg_rating);
    if (!Number.isNaN(rating)) {
      tiles.push({ icon: 'star', label: 'Rating', value: seller.review_count != null ? `${rating.toFixed(1)} (${seller.review_count})` : rating.toFixed(1) });
    }
  }
  if (seller.years_in_market != null) {
    tiles.push({ icon: 'calendar', label: 'In market', value: `${seller.years_in_market} yr${seller.years_in_market === 1 ? '' : 's'}` });
  }
  if (seller.completed_orders != null) {
    tiles.push({ icon: 'basket', label: 'Orders complete', value: String(seller.completed_orders) });
  }
  if (seller.completion_rate != null) {
    tiles.push({ icon: 'check', label: 'Completion rate', value: `${seller.completion_rate}%` });
  }
  return tiles;
}

const QUICK_LINKS = [
  { to: '/seller/orders', icon: 'box', label: 'Orders' },
  { to: '/seller/payouts', icon: 'card', label: 'Payouts' },
  { to: '/seller/products', icon: 'basket', label: 'Products' },
  { to: '/seller/negotiations', icon: 'handshake', label: 'Bargaining' },
  { to: '/seller/ads', icon: 'megaphone', label: 'Ads' },
  { to: '/seller/analytics', icon: 'tag', label: 'Analytics' },
  { to: '/seller/appearance', icon: 'settings', label: 'Storefront look' },
] as const;

/** Seller account & profile, fully inside the portal. */
export default function SellerAccountPage() {
  const nav = useNavigate();
  const user = getUser();
  const userId = getUserId();
  const [seller, setSeller] = useState<Seller | null>(null);

  useEffect(() => {
    if (!userId) {
      nav('/', { replace: true });
      return;
    }
    let alive = true;
    getStorefront(userId)
      .then((s) => {
        if (alive) setSeller(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, nav]);

  const type = seller?.seller_type || seller?.profile_type || '';
  const initials = (user?.full_name ?? 'S')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const stats = seller ? buildStats(seller) : [];

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6">
      <div>
        <h1 className="text-lg font-black text-gray-900">My account</h1>
        <p className="text-xs text-gray-500">Your seller identity, contact details and key numbers.</p>
      </div>

      {/* Identity */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="h-20 bg-gradient-to-r from-primary to-primary-dark" />
        <div className="px-5 pb-6 lg:px-8">
          <div className="-mt-9 flex items-end gap-4">
            <div className="w-[88px] shrink-0">
              <div className="aspect-square rounded-full bg-white p-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <div className="grid h-full w-full place-items-center rounded-full bg-primary-light text-base font-black text-primary">
                  {initials}
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <h2 className="truncate text-lg font-black text-gray-900">{user?.full_name}</h2>
              <p className="text-xs font-semibold text-primary">
                {SELLER_TYPE_LABELS[type] || type || 'Seller'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {seller?.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#D6F5E7] px-2.5 py-1 text-[10px] font-bold text-[#087A38]">
                    <Icon name="shield" size={12} /> Verified storefront
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                    <Icon name="clock" size={12} /> KYC not completed
                  </span>
                )}
                {seller?.business_name && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-600">
                    {seller.business_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {seller?.member_since && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
              <Icon name="calendar" size={14} className="text-primary" />
              Selling since {seller.member_since}
            </p>
          )}
          {seller?.bio && <p className="mt-3 text-xs leading-relaxed text-gray-500">{seller.bio}</p>}

          {stats.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-5 lg:grid-cols-4 lg:gap-4">
              {stats.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                    <Icon name={s.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-gray-900">{s.value}</div>
                    <div className="truncate text-[10px] text-gray-500">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">Contact details</h3>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-3">
            <Icon name="phone" size={15} className="text-primary" />
            <span className="truncate font-medium text-gray-700">{user?.phone ?? 'Not set'}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-3">
            <Icon name="message" size={15} className="text-primary" />
            <span className="truncate font-medium text-gray-700">{user?.email ?? 'Not set'}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-3">
            <Icon name="store" size={15} className="text-primary" />
            <span className="truncate font-medium text-gray-700">{seller?.market_name ?? 'No primary market set'}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-3">
            <Icon name="pin" size={15} className="text-primary" />
            <span className="truncate font-medium text-gray-700">
              {seller?.stall_number ? `Stall ${seller.stall_number}` : 'No stall number set'}
            </span>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">Manage your business</h3>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {QUICK_LINKS.map((l) => (
            <button
              key={l.to}
              type="button"
              onClick={() => nav(l.to)}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left text-xs font-semibold text-gray-700 transition hover:border-primary/30 hover:bg-primary-light/40"
            >
              <Icon name={l.icon} size={15} className="text-primary" />
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => nav('/seller/storefront')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <Icon name="store" size={14} />
          My storefront
        </button>
        <button
          type="button"
          onClick={() => {
            clearSession();
            nav('/', { replace: true });
          }}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <Icon name="logout" size={14} />
          Log out
        </button>
      </div>
    </div>
  );
}