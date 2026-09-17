import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStorefront, type Seller } from '../lib/api';
import { getUserId } from '../lib/session';
import { SellerStorefrontView } from '../components/seller/SellerStorefrontView';
import { Icon } from '../components/icons';

/** "My storefront" preview rendered INSIDE the seller portal (no marketplace chrome). */
export default function SellerStorefrontPage() {
  const nav = useNavigate();
  const userId = getUserId();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      nav('/', { replace: true });
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    getStorefront(userId)
      .then((s) => {
        if (alive) setSeller(s);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your storefront.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, nav]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="h-6 w-44 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="h-24 animate-pulse bg-gray-100" />
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-full bg-gray-100" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 h-5 w-52 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
          <Icon name="store" size={24} />
        </span>
        <p className="text-sm font-bold text-gray-900">Your storefront is not ready yet</p>
        <p className="mx-auto mt-1 max-w-[340px] text-xs text-gray-500">
          {error ?? 'We could not load your seller profile. Make sure your account has an active seller profile.'}
        </p>
        <button
          type="button"
          onClick={() => nav('/seller/products')}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
        >
          Manage your products
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900">My storefront</h1>
          <p className="text-xs text-gray-500">This is how customers see you on the market.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nav('/seller/appearance')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Icon name="settings" size={14} />
            Edit look
          </button>
          <button
            type="button"
            onClick={() => nav(`/sellers/${seller.id}`)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Icon name="shopping-bag" size={14} />
            View on market
          </button>
        </div>
      </div>

      <SellerStorefrontView seller={seller} onOpenProduct={(o) => nav(`/offers/${o.id}`)} />
    </div>
  );
}