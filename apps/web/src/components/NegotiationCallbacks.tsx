import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  subscribeNegotiations,
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
}

/**
 * Floats a toast whenever the seller replies to a bargaining bid (async
 * replies) while the buyer is elsewhere. Server push + a light poll keep the
 * store fresh, so all we do is diff the thread and surface new seller replies.
 */
export function NegotiationCallbacks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<Toast | null>(null);
  const toasted = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
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
            title: `${n.seller.name.split(' ')[0]} don reply your bargaining`,
            body:
              newest.kind === 'SELLER_ACCEPT'
                ? `Agreed! ${price != null ? `${fmt(price)} each — e dey wait.` : 'E dey wait for you.'}`
                : price != null ? `Counter: ${fmt(price)} each — coman see am.` : 'New price await — coman see am.',
            to: negotiationDeepLink(n),
          });
        }
      }
    });

    return () => off();
  }, [location.pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-[90] sm:bottom-8 sm:left-1/2 sm:inset-x-auto sm:w-[420px] sm:-translate-x-1/2">
      <div className="animate-sheet-up flex items-center gap-3 rounded-2xl border border-primary/20 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
          <Icon name="message" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-text">{toast.title}</p>
          <p className="truncate text-[11px] font-medium text-textSecondary">{toast.body}</p>
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