import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWishlist, removeFromWishlist, type WishlistEntry } from '../lib/api';
import { activeBuyerId, AUTH_EVENT } from '../lib/session';
import { getWishlist as cachedWishlist, replaceWishlist, dropWishlist, subscribeWishlist } from '../lib/wishlist';
import { OfferCard } from '../components/OfferCard';
import { Icon } from '../components/icons';

export default function WishlistPage() {
  const navigate = useNavigate();
  const userId = activeBuyerId();
  const [entries, setEntries] = useState<WishlistEntry[] | null>(() => cachedWishlist(userId));

  const refresh = () => {
    getWishlist(userId)
      .then((list) => {
        replaceWishlist(userId, list);
        setEntries(list);
      })
      .catch(() => setEntries((prev) => prev ?? []));
  };

  useEffect(() => {
    refresh();
    const unsub = subscribeWishlist((list) => setEntries(list));
    const onAuth = () => setEntries(cachedWishlist(activeBuyerId()));
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      unsub();
      window.removeEventListener(AUTH_EVENT, onAuth);
    };
  }, [userId]);

  const remove = (offerId: string) => {
    setEntries((prev) => prev?.filter((e) => e.offer_id !== offerId) ?? prev);
    dropWishlist(userId, offerId);
    removeFromWishlist(userId, offerId).catch(() => refresh());
  };

  return (
    <div className="flex h-full flex-col bg-surface/60">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-semibold text-text">My Wishlist</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
          <Icon name="heart" size={12} />
          {entries == null ? '…' : entries.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        {entries == null ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-textSecondary">Loading your wishlist…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
              <Icon name="heart" size={24} />
            </span>
            <p className="mt-3 text-sm font-bold text-text">Your wishlist dey empty</p>
            <p className="mt-1 text-xs text-textSecondary">
              Tap the heart on any item to save it here for later.
            </p>
            <button
              type="button"
              onClick={() => navigate('/offers')}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
            >
              Go dey shop
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {entries.map((entry) => (
              <OfferCard
                key={entry.offer_id}
                offer={entry.offer}
                wished
                onClick={() => navigate(`/offers/${entry.offer_id}`)}
                onWishlistToggle={() => remove(entry.offer_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}