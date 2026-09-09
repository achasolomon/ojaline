import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { getUserId } from '../lib/session';
import { addSeenAd, isAdSeen, adTargetUrl } from '../lib/ads';
import {
  connectMarketFeed,
  disconnectMarketFeed,
  sendPresenceHeartbeat,
  type MarketEnvelope,
} from '../lib/realtime';
import { Icon, type IconName } from './icons';

type Kind = 'SELLER_ONLINE' | 'NEW_ITEM' | 'PRICE_BUZZ' | 'AD';

interface Toast {
  id: number;
  kind: Kind;
  title: string;
  body: string;
  ctaLabel: string;
  to: string;
  expiresAt: number;
}

interface SellerOnlinePayload { seller_id: string; seller_name: string; market_name?: string; }
interface OfferCreatedPayload { offer_id: string; seller_id: string; seller_name: string; product_name: string; price_cents?: number; unit?: string; }
interface PriceChangedPayload { offer_id: string; seller_id: string; seller_name: string; product_name: string; old_price_cents?: number; new_price_cents?: number; unit?: string; }
interface AdPublishedPayload {
  ad_id: string;
  seller_id: string;
  seller_name: string;
  title: string;
  body?: string;
  format: string;
  image_key?: string;
  target_type: 'OFFER' | 'SELLER' | 'NONE';
  target_id?: string;
}

const DURATION_MS = 10000;
const MAX_TOASTS = 3;
const STALE_MS = 10 * 60 * 1000;

const KIND_ICON: Record<Kind, IconName> = {
  SELLER_ONLINE: 'store',
  NEW_ITEM: 'box',
  PRICE_BUZZ: 'bolt',
  AD: 'megaphone',
};

const KIND_STYLE: Record<Kind, { avatar: string; bar: string; tag: string }> = {
  SELLER_ONLINE: { avatar: 'bg-primary-light text-primary', bar: 'bg-primary', tag: 'Seller online' },
  NEW_ITEM: { avatar: 'bg-[#FFF6DA] text-[#A36A00]', bar: 'bg-secondary', tag: 'New item' },
  PRICE_BUZZ: { avatar: 'bg-[#FFF0E0] text-[#D97A06]', bar: 'bg-[#E87A1A]', tag: 'Price drop' },
  AD: { avatar: 'bg-[#E8F0FF] text-[#0B63C9]', bar: 'bg-[#2E7CF6]', tag: 'Sponsored' },
};

let toastSeq = 1;

function envelopeToToast(env: MarketEnvelope, selfId: string | null): Omit<Toast, 'id' | 'expiresAt'> | null {
  if (env.event_type === 'market.seller_online') {
    const p = env.payload as unknown as SellerOnlinePayload;
    if (!p.seller_id || p.seller_id === selfId) return null;
    return {
      kind: 'SELLER_ONLINE',
      title: `${p.seller_name} is now online`,
      body: p.market_name
        ? `Just opened the stall at ${p.market_name}. Fresh things don dey the shop.`
        : 'Just opened the stall. Fresh things don dey the shop.',
      ctaLabel: 'Visit stall',
      to: `/sellers/${p.seller_id}`,
    };
  }

  if (env.event_type === 'market.offer_created') {
    const p = env.payload as unknown as OfferCreatedPayload;
    if (!p.offer_id || p.seller_id === selfId) return null;
    const price = p.price_cents != null ? naira.format(p.price_cents / 100) : '';
    return {
      kind: 'NEW_ITEM',
      title: `New item from ${p.seller_name}`,
      body: `${p.product_name} don reach the market — ${price}${p.unit ? `/${p.unit}` : ''}.`,
      ctaLabel: 'View item',
      to: `/offers/${p.offer_id}`,
    };
  }

  if (env.event_type === 'market.offer_price_changed') {
    const p = env.payload as unknown as PriceChangedPayload;
    if (!p.offer_id || p.seller_id === selfId) return null;
    if (p.new_price_cents == null || p.old_price_cents == null || p.new_price_cents >= p.old_price_cents) return null;
    return {
      kind: 'PRICE_BUZZ',
      title: `${p.seller_name} just dropped a price`,
      body: `${p.product_name} now ${naira.format(p.new_price_cents / 100)}${p.unit ? `/${p.unit}` : ''} (was ${naira.format(p.old_price_cents / 100)}) — today only.`,
      ctaLabel: 'See it',
      to: `/offers/${p.offer_id}`,
    };
  }

  if (env.event_type === 'marketing.ad_published') {
    const p = env.payload as unknown as AdPublishedPayload;
    if (!p.ad_id || !p.seller_id || p.seller_id === selfId) return null;
    if (p.format !== 'TOAST') return null;
    if (isAdSeen(p.ad_id)) return null;
    addSeenAd(p.ad_id);
    return {
      kind: 'AD',
      title: `${p.seller_name} is advertising “${p.title}”`,
      body: p.body || 'Tap to see what they are promoting.',
      ctaLabel: 'View ad',
      to: adTargetUrl({ target_type: p.target_type, target_id: p.target_id ?? null, seller_id: p.seller_id }),
    };
  }

  return null;
}

export function MarketActivityFeed() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);
  const toastsRef = useRef<Toast[]>([]);
  toastsRef.current = toasts;

  // Expiry sweep — frozen while paused so hovering pauses auto-dismiss too.
  useEffect(() => {
    if (paused) return;
    const iv = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => {
        const next = prev.filter((t) => t.expiresAt > now);
        return next.length === prev.length ? prev : next;
      });
    }, 250);
    return () => window.clearInterval(iv);
  }, [paused]);

  // Live market feed — real events from the API (SSE), replayed on reconnect.
  useEffect(() => {
    let mounted = true;
    const shown = new Set<string>();

    const pushToast = (ev: Omit<Toast, 'id' | 'expiresAt'>) => {
      if (!mounted) return;
      const toast: Toast = { id: toastSeq++, ...ev, expiresAt: Date.now() + DURATION_MS };
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), toast]);
    };

    connectMarketFeed((env) => {
      if (!env.event_type.startsWith('market.') && !env.event_type.startsWith('marketing.')) return;
      const occurredMs = Date.parse(env.occurred_at);
      if (!Number.isNaN(occurredMs) && Date.now() - occurredMs > STALE_MS) return;

      const key = `${env.event_type}:${env.aggregate_id}`;
      if (shown.has(key)) return;
      shown.add(key);

      const ev = envelopeToToast(env, getUserId());
      if (ev) pushToast(ev);
    });

    return () => {
      mounted = false;
      disconnectMarketFeed();
    };
  }, []);

  // Presence heartbeat — announces logged-in sellers as "online in the market".
  useEffect(() => {
    void sendPresenceHeartbeat();
    const iv = window.setInterval(() => void sendPresenceHeartbeat(), 30000);
    return () => window.clearInterval(iv);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const go = (t: Toast) => {
    navigate(t.to);
    dismiss(t.id);
  };

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[88px] z-[65] flex flex-col items-stretch gap-2 px-3 sm:items-end lg:bottom-6 lg:left-auto lg:right-6 lg:w-[380px] lg:px-0"
    >
      {toasts.map((t) => {
        const s = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="market-toast animate-sheet-up pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${s.avatar}`}>
                <Icon name={KIND_ICON[t.kind]} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold leading-snug text-text">{t.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-textSecondary">{t.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Close notification"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-textSecondary transition hover:bg-neutral-200 hover:text-text"
              >
                <Icon name="close" size={11} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-textSecondary">{s.tag}</span>
              <button
                type="button"
                onClick={() => go(t)}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-primary-dark"
              >
                {t.ctaLabel} <Icon name="arrowRight" size={10} />
              </button>
            </div>

            <div className="h-[3px] bg-surface">
              <div className={`animate-progress h-full ${s.bar}`} style={{ animationDuration: `${DURATION_MS}ms` }} />
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}