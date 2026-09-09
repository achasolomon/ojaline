import type { IconName } from '../components/icons';

/**
 * Homepage promo slides (desktop carousel + mobile hero).
 *
 * Images are intentionally data-driven, not baked into the component:
 *  - `image.url`        → static file under /images/banners/ (drop a file, edit this list).
 *  - `image.storageKey` → a live image served from the media API (/api/media/<key>),
 *                         so the visual can change without a redeploy.
 * If no image is set (or it fails to load) the slide falls back to its own
 * gradient + `fallbackIcon` graphic, so slides always stay visually distinct.
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

export const PROMO_SLIDES: PromoSlide[] = [
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

/** Resolve a slide's image URL (media API wins over static file). */
export function promoImageUrl(slide: PromoSlide): string | null {
  if (slide.image?.storageKey) return `/api/media/${slide.image.storageKey}`;
  if (slide.image?.url) return slide.image.url;
  return null;
}