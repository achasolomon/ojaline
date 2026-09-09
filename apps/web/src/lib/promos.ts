import { useEffect, useState } from 'react';
import type { IconName } from '../components/icons';
import { getBanners, getMarketDay, type MarketDayInfo } from './api';

/**
 * Homepage promo slides (desktop carousel + mobile hero). Loaded live from
 * /content/banners so a merchant or ops tweak changes the homepage without a
 * redeploy. Falls back to a static starter set only while the API is loading
 * or unreachable.
 */
export interface PromoSlide {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  gradient: string;
  image?: { url?: string; storageKey?: string; alt?: string };
  fallbackIcon: IconName;
}

const FALLBACK_SLIDES: PromoSlide[] = [
  {
    id: 'flash',
    title: 'Flash Sale',
    subtitle: 'Time-limited prices on fresh produce. Grab today\u2019s market-day lows before they sell out.',
    cta: 'Shop Flash Sale',
    href: '/offers?sort=cheapest',
    gradient: 'linear-gradient(120deg,#7a1430 0%,#b2233f 45%,#e05a3a 100%)',
    image: { url: '/images/banners/slide-flash.jpg', alt: 'Flash sale produce' },
    fallbackIcon: 'bolt',
  },
  {
    id: 'cheap',
    title: 'Budget Pick',
    subtitle: 'Everyday essentials at wallet-friendly prices from verified local sellers near you.',
    cta: 'See Lowest Prices',
    href: '/offers?sort=cheapest',
    gradient: 'linear-gradient(120deg,#8a4d00 0%,#d77900 45%,#ffb228 100%)',
    image: { url: '/images/banners/slide-budget.jpg', alt: 'Budget produce picks' },
    fallbackIcon: 'tag',
  },
  {
    id: 'popular',
    title: 'Popular Right Now',
    subtitle: 'The trendiest produce this week, ranked by demand from real market shoppers.',
    cta: "See What's Hot",
    href: '/offers?sort=popular',
    gradient: 'linear-gradient(120deg,#056e31 0%,#07883f 45%,#79aa76 100%)',
    image: { url: '/images/banners/slide-popular.jpg', alt: 'Popular produce' },
    fallbackIcon: 'star',
  },
  {
    id: 'new',
    title: 'New Arrivals',
    subtitle: 'New products from trusted farmers and sellers, listed just in time for this market day.',
    cta: 'Discover New Arrivals',
    href: '/offers?sort=newest',
    gradient: 'linear-gradient(120deg,#3b2f7a 0%,#6b5ae0 45%,#9fa5ff 100%)',
    image: { url: '/images/banners/slide-new.jpg', alt: 'New arrivals produce' },
    fallbackIcon: 'clock',
  },
];

const FALLBACK_GRADIENT = 'linear-gradient(120deg,#056e31 0%,#07883f 45%,#79aa76 100%)';

const KNOWN_ICONS: IconName[] = ['bolt', 'tag', 'star', 'clock', 'basket', 'leaf', 'box', 'store', 'megaphone'];

function iconFrom(value: string | null | undefined): IconName {
  if (value && (KNOWN_ICONS as string[]).includes(value)) return value as IconName;
  return 'basket';
}

function bannerToSlide(b: {
  id: string;
  title: string;
  subtitle: string;
  cta_label: string | null;
  cta_href: string | null;
  image_key: string | null;
  gradient: string | null;
  fallback_icon: string;
  sort_order: number;
}): PromoSlide {
  const image =
    b.image_key != null ?
      (/^https?:\/\//i.test(b.image_key) || b.image_key.startsWith('/')
        ? { url: b.image_key, alt: b.title }
        : { storageKey: b.image_key, alt: b.title })
      : undefined;
  return {
    id: `banner-${String(b.id).slice(0, 8)}`,
    title: b.title,
    subtitle: b.subtitle,
    cta: b.cta_label || 'Shop now',
    href: b.cta_href || '/offers',
    gradient: b.gradient || FALLBACK_GRADIENT,
    image,
    fallbackIcon: iconFrom(b.fallback_icon),
  };
}

/** Resolve a slide's image URL (media API wins over static file). */
export function promoImageUrl(slide: PromoSlide): string | null {
  if (slide.image?.storageKey) return `/api/media/${slide.image.storageKey}`;
  if (slide.image?.url) return slide.image.url;
  return null;
}

/* ------------------------------ promo store ------------------------------ */

type PromoListener = (slides: PromoSlide[]) => void;

const listeners = new Set<PromoListener>();

let slides: PromoSlide[] = FALLBACK_SLIDES;
let loaded = false;
let inFlight: Promise<void> | null = null;

function emit(): void {
  listeners.forEach((l) => l(slides));
}

export async function refreshPromos(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const banners = await getBanners();
      const hero = banners
        .filter((b) => b.slot === 'HERO')
        .sort((a, b) => a.sort_order - b.sort_order);
      if (hero.length > 0) {
        slides = hero.map((b) => bannerToSlide(b));
      }
    } catch {
      /* offline — keep the fallback set */
    } finally {
      loaded = true;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

export function getPromoSlides(): PromoSlide[] {
  if (!loaded) void refreshPromos();
  return slides;
}

export function subscribePromos(listener: PromoListener): () => void {
  listeners.add(listener);
  void refreshPromos();
  return () => listeners.delete(listener);
}

export function usePromos(): PromoSlide[] {
  const [current, setCurrent] = useState<PromoSlide[]>(() => {
    void refreshPromos();
    return slides;
  });
  useEffect(() => subscribePromos(setCurrent), []);
  return current;
}

/* ------------------------------ market day ------------------------------ */

export function useMarketDay(): MarketDayInfo | null {
  const [info, setInfo] = useState<MarketDayInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMarketDay()
      .then((d) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

export function formatMarketDayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}