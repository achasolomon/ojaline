import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  subscribeNegotiations,
  resumeCallbacks,
  getNegotiations,
  negotiationDeepLink,
  type Negotiation,
} from '../lib/negotiation';
import { Icon } from './icons';

const fmt = (kobo: number) => naira.format(kobo / 100);
const REPLY_KINDS = new Set(['SELLER_OFFER', 'SELLER_ACCEPT']);

interface Toast {
  key: string;
  title: string;
  body: string;
  to: string;
  tone: 'callback' | 'reply';
}

/**
 * Runs due seller call-backs (also across reloads) and floats a toast when a
 * seller reaches back after the buyer walked away — or whenever the seller
 * replies to a haggling bid (async replies) while the buyer is elsewhere.
 */
export function NegotiationCallbacks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<Toast | null>(null);
  const toasted = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    resumeCallbacks();
    const iv = setInterval(resumeCallbacks, 4000);
    const teardown = () => clearInterval(iv);

    let prev = 0;
    const off = subscribeNegotiations((items) => {
      if (!primed.current) {
        for (const n of items) {
          for (const m of n.messages) if (REPLY_KINDS.has(m.kind)) toasted.current.add(m.id);
        }
        primed.current = true;
      }

      for (const n of items) {
        if (n.draft || location.pathname === negotiationDeepLink(n)) continue;
        const newest = [...n.messages].reverse().find((m) => REPLY_KINDS.has(m.kind));
        if (newest && !toasted.current.has(newest.id)) {
          toasted.current.add(newest.id);
          const price = newest.per_unit_kobo;
          setToast({
            key: newest.id,
            title: `${n.seller.name.split(' ')[0]} don reply your haggling`,
            body:
              newest.kind === 'SELLER_ACCEPT'
                ? `Agreed! ${price != null ? `${fmt(price)} each — e dey wait.` : 'E dey wait for you.'}`
                : price != null ? `Counter: ${fmt(price)} each — coman see am.` : 'New price await — coman see am.',
            to: negotiationDeepLink(n),
            tone: 'reply',
          });
        }
      }

      const unseen = getNegotiations().reduce((acc, n) => acc + n.unseen_callbacks, 0);
      if (unseen > prev) {
        const fresh = [...items]
          .filter((n) => n.unseen_callbacks > 0)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        if (fresh && location.pathname !== negotiationDeepLink(fresh)) {
          const latest = [...fresh.messages].reverse().find((m) => m.kind === 'CALLBACK');
          const price = latest?.per_unit_kobo;
          setToast({
            key: fresh.id,
            title: `${fresh.seller.name.split(' ')[0]} don call you back`,
            body: price != null ? `New price: ${fmt(price)} each — e wan settle o.` : 'New price await — e wan settle o.',
            to: negotiationDeepLink(fresh),
            tone: 'callback',
          });
        }
      }
      prev = unseen;
    });

    return () => {
      teardown();
      off();
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-[90] sm:bottom-8 sm:left-1/2 sm:inset-x-auto sm:w-[420px] sm:-translate-x-1/2">
      <div
        className={`animate-sheet-up flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)] ${
          toast.tone === 'callback' ? 'border-[#E3B21F] bg-[#FFF6DA]' : 'border-primary/20 bg-white'
        }`}
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
            toast.tone === 'callback' ? 'bg-[#F5A623]/20 text-[#A36A00]' : 'bg-primary-light text-primary'
          }`}
        >
          <Icon name={toast.tone === 'callback' ? 'bell' : 'message'} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[12px] font-bold ${
              toast.tone === 'callback' ? 'text-[#6B4A00]' : 'text-text'
            }`}
          >
            {toast.title}
          </p>
          <p
            className={`truncate text-[11px] font-medium ${
              toast.tone === 'callback' ? 'text-[#8A5F00]' : 'text-textSecondary'
            }`}
          >
            {toast.body}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(toast.to)}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-dark"
        >
          Open
        </button>
      </div>
    </div>
  );
}

export type { Negotiation };