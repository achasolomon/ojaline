import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { mediaUrl } from '../../lib/api';
import {
  formatMarketDayDate, promoImageUrl, useMarketDay, usePromos, type PromoSlide,
} from '../../lib/promos';
import { Icon } from '../icons';

const AUTOPLAY_MS = 6000;

function SlideArtwork({ slide }: { slide: PromoSlide }) {
  const [failed, setFailed] = useState(false);
  const src = promoImageUrl(slide);
  if (failed || !src) {
    return (
      <div className="w-full h-full grid place-items-center bg-white/10">
        <Icon name={slide.fallbackIcon} size={70} className="text-white/45" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={slide.image?.alt ?? ''}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

export function DesktopHero() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const slides = usePromos();
  const marketDay = useMarketDay();

  const last = Math.max(1, slides.length);

  const goTo = useCallback((i: number) => {
    setIndex(((i % last) + last) % last);
  }, [last]);

  const slide = slides[Math.min(index, slides.length - 1)];

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % last), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [last]);

  const marketImg = marketDay?.banner?.image_key ? mediaUrl(marketDay.banner.image_key) : null;

  return (
    <section className="max-w-[1200px] mx-auto px-6 py-4">
      <div className="grid gap-[17px]" style={{ gridTemplateColumns: 'minmax(0,1fr) 290px' }}>
        {/* Ad / Promo Banner */}
        <div
          className="h-[325px] rounded-[14px] overflow-hidden relative text-white"
          style={{ background: slide.gradient }}
        >
          {/* This slide's full-bleed artwork — carries its own design */}
          <div className="absolute inset-0">
            <SlideArtwork slide={slide} />
          </div>

          {/* Subtle fade so the action buttons stay legible */}
          <div
            className="absolute inset-0 z-[2]"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.4))' }}
          />

          {/* Action buttons */}
          <div className="absolute z-[3] left-[43px] bottom-[28px] flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate(slide.href)}
              className="border-0 rounded-[7px] px-[17px] py-[11px] text-[11px] font-extrabold bg-white text-[#07883f] cursor-pointer hover:shadow-md transition"
            >
              {slide.cta}
            </button>
            <button
              type="button"
              onClick={() => navigate('/market-days')}
              className="rounded-[7px] px-[17px] py-[11px] text-[11px] font-extrabold bg-secondary text-tertiary cursor-pointer hover:bg-secondary/90 transition"
            >
              Explore Market Day
            </button>
          </div>

          {/* Arrows */}
          <button
            type="button"
            aria-label="Previous promo"
            onClick={() => goTo(index - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-[5] w-9 h-9 rounded-full bg-white/15 border border-white/30 text-white grid place-items-center cursor-pointer backdrop-blur-sm transition hover:bg-white/30"
          >
            <Icon name="chevronDown" size={16} className="rotate-90" />
          </button>
          <button
            type="button"
            aria-label="Next promo"
            onClick={() => goTo(index + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-[5] w-9 h-9 rounded-full bg-white/15 border border-white/30 text-white grid place-items-center cursor-pointer backdrop-blur-sm transition hover:bg-white/30"
          >
            <Icon name="chevronDown" size={16} className="-rotate-90" />
          </button>

          {/* Dots */}
          <div className="absolute z-[5] bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to ${s.title.split('\n')[0]}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer border-none ${
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>

          {/* Trust card overlay */}
          <div className="absolute z-[4] right-[18px] top-[28px] bg-white text-text w-[205px] rounded-[11px] p-3.5 shadow-[0_10px_25px_rgba(0,0,0,0.02)] hidden xl:block">
            {[
              { icon: 'check' as const, label: 'Verified Sellers', sub: 'All sellers are verified' },
              { icon: 'bolt' as const, label: 'Fast Delivery', sub: 'From 30 mins' },
              { icon: 'lock' as const, label: 'Secure Payments', sub: 'Protected checkout' },
              { icon: 'shield' as const, label: 'Buyer Protection', sub: 'Shop with confidence' },
            ].map((item, i) => (
              <div key={item.label} className={`flex gap-2.5 py-2 ${i < 3 ? 'border-b border-border' : ''}`}>
                <span className="text-primary w-5 h-5 grid place-items-center shrink-0">
                  <Icon name={item.icon} size={15} />
                </span>
                <div>
                  <strong className="block text-[10px] text-text">{item.label}</strong>
                  <span className="text-[9px] text-text-secondary">{item.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Day Sidebar */}
        <aside className="bg-white border border-border rounded-[14px] overflow-hidden hidden xl:flex flex-col">
          <div className="p-4">
            <div className="text-[10px] text-text-secondary font-extrabold uppercase tracking-wide">MARKET DAY</div>
            <h2 className="mt-1 mb-0 text-primary text-[20px] leading-tight">Wholesale Prices</h2>
            <p className="text-[11px] text-text-secondary leading-[1.5] mt-1">
              Save more when you buy in bulk from trusted market sellers
              {marketDay?.next_date
                ? ` — ${marketDay.market_count} markets, ${marketDay.product_count} products on ${formatMarketDayDate(marketDay.next_date)}.`
                : '.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/market-days')}
              className="mt-3 bg-primary text-white text-[11px] font-extrabold rounded-[7px] px-[17px] py-2 border-none cursor-pointer hover:bg-primary-dark transition"
            >
              Shop Market Day
            </button>
          </div>
          <div
            className="h-[110px] bg-cover bg-center"
            style={{
              backgroundImage: marketImg ? `url(${marketImg})` : 'url(/images/market-day.jpeg)',
              backgroundColor: '#dce9c7',
            }}
          />
          <div className="flex justify-between px-4 py-2 border-t border-border text-[10px]">
            <span className="text-text-secondary flex items-center gap-1"><Icon name="calendar" size={12} /> Next Market Day</span>
            <b className="text-text">{marketDay?.next_date ? formatMarketDayDate(marketDay.next_date) : '—'}</b>
          </div>
        </aside>
      </div>
    </section>
  );
}