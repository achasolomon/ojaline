import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveAds, type Ad } from '../lib/api';
import { isAdSeen, addSeenAd, adTargetUrl } from '../lib/ads';
import { Icon } from './icons';

/**
 * Homepage banner slot (ADR-009, format = BANNER). Fetches the latest active
 * room-wide banner and shows it unless this device has already seen it.
 * Tapping the ad, its CTA or the close control marks it seen on this device.
 */
export function HomeAdBanner() {
  const navigate = useNavigate();
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveAds({ format: 'BANNER' })
      .then((ads) => {
        if (cancelled) return;
        const candidate = ads[0];
        if (candidate && isAdSeen(candidate.id)) return;
        setAd(candidate ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const open = () => {
    if (!ad) return;
    addSeenAd(ad.id);
    navigate(adTargetUrl(ad));
  };

  if (!ad) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2E7CF6] to-[#0B63C9] text-white shadow-sm">
      <button
        type="button"
        onClick={() => { addSeenAd(ad.id); setAd(null); }}
        aria-label="Dismiss ad"
        className="absolute right-2.5 top-2.5 z-10 grid h-6 w-6 place-items-center rounded-full border-none bg-white/15 text-white cursor-pointer hover:bg-white/25 transition"
      >
        <Icon name="close" size={13} />
      </button>

      <button type="button" onClick={open} className="w-full border-none bg-transparent text-left cursor-pointer p-4 flex items-center gap-3.5">
        {ad.image_key ? (
          <img
            src={`/api/media/${ad.image_key}`}
            alt=""
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-white/15">
            <Icon name="megaphone" size={26} />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">
            <Icon name="megaphone" size={9} /> Sponsored
          </span>
          <span className="mt-1.5 block truncate text-sm font-bold">{ad.title}</span>
          {ad.body && <span className="mt-0.5 block text-[11px] leading-snug text-white/85 line-clamp-2">{ad.body}</span>}
        </span>
        <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#0B63C9]">
          View
        </span>
      </button>
    </div>
  );
}