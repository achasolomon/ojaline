import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTopSellers } from '../lib/api';
import type { TopSeller } from '../lib/api';
import { Icon } from './icons';

const STORAGE_KEY = 'kika_welcome_seen';

const FALLBACK_SELLERS: TopSeller[] = [
  { id: 'fb-farmer', name: 'Adebola Akinwale', seller_type: 'FARMER', avg_rating: 4.9, review_count: 212, bio: null, market_count: 1 },
  { id: 'fb-market-woman', name: 'Bisi Olatunji', seller_type: 'MARKET_WOMAN', avg_rating: 4.8, review_count: 160, bio: null, market_count: 2 },
  { id: 'fb-store', name: 'Chidi Eze', seller_type: 'STORE', avg_rating: 4.7, review_count: 98, bio: null, market_count: 1 },
];

export function hasSeenWelcome(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function markWelcomeSeen(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

function AvatarStack({ sellers }: { sellers: TopSeller[] }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex -space-x-2">
        {sellers.slice(0, 3).map((s) => (
          <div
            key={s.id}
            className="w-8 h-8 rounded-full border-2 border-white bg-primary-light text-primary grid place-items-center font-black text-[10px]"
          >
            {s.name.trim().charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-text">Meet your top local sellers</div>
        <div className="text-[10px] text-text-secondary truncate">
          {sellers.slice(0, 2).map((s) => s.name.split(' ')[0]).join(', ')}
          {sellers.length > 2 ? ` +${sellers.length - 2} more` : ''}
        </div>
      </div>
    </div>
  );
}

export function WelcomeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [sellers, setSellers] = useState<TopSeller[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timeout = new Promise<TopSeller[]>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3500));
    Promise.race([getTopSellers(3), timeout])
      .then((s) => {
        if (cancelled) return;
        setSellers(s && s.length > 0 ? s : FALLBACK_SELLERS);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSellers(FALLBACK_SELLERS);
          setLoading(false);
        }
      });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const goOffers = () => {
    onClose();
    navigate('/offers');
  };
  const goSellers = () => {
    onClose();
    navigate('/chat');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-[24px] overflow-hidden bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Image band */}
        <div className="relative h-[190px]">
          <img src="/images/hero-produce.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,23,18,0.35) 0%, rgba(15,23,18,0.1) 45%, rgba(15,23,18,0.55) 100%)' }} />
          <div className="absolute inset-0 flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <img src="/images/logo_white.png" alt="Kika" className="h-7 w-auto object-contain" />
              <button
                type="button"
                onClick={onClose}
                className="text-white/85 text-[9px] font-extrabold uppercase tracking-[0.18em] bg-transparent border-none cursor-pointer hover:text-white transition"
              >
                Skip
              </button>
            </div>
            <span className="inline-flex self-start items-center gap-1.5 bg-gold text-tertiary text-[9px] font-black uppercase tracking-[0.14em] rounded-full px-2.5 py-1">
              <Icon name="bolt" size={11} /> Farm to table
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 pb-5">
          {loading ? (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex -space-x-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white shimmer" />
                ))}
              </div>
              <div className="h-3 w-28 bg-surface rounded" />
            </div>
          ) : sellers && sellers.length > 0 ? (
            <AvatarStack sellers={sellers} />
          ) : null}

          <h2 className="text-text text-[22px] font-black leading-tight mb-1">
            Fresh from Farm to Your Door
          </h2>
          <p className="text-text-secondary text-[12px] leading-relaxed mb-4">
            Trusted local sellers. Fair prices. Real value — every market day.
          </p>

          <button
            type="button"
            onClick={goOffers}
            className="w-full h-[46px] rounded-[12px] bg-gold text-tertiary text-[13px] font-black flex items-center justify-center gap-2 border-none cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all duration-200 shadow-[0_8px_20px_rgba(255,197,46,0.35)]"
          >
            Start Exploring <Icon name="arrowRight" size={15} />
          </button>
          <button
            type="button"
            onClick={goSellers}
            className="w-full mt-2 h-[40px] rounded-[12px] bg-white text-primary text-[11px] font-bold border border-primary cursor-pointer hover:bg-primary-light transition"
          >
            Talk to our sellers
          </button>
        </div>
      </div>
    </div>
  );
}