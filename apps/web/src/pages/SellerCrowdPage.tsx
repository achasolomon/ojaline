import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { Icon, type IconName } from '../components/icons';
import { getUserId } from '../lib/session';
import { cn } from '../lib/cn';
import {
  createCrowdSale,
  listCrowdSales,
  closeCrowdSale,
  getMyOffers,
  getWantsForSeller,
  type CrowdSale,
  type CrowdWant,
  type MyOffer,
} from '../lib/api';
import { mapWant, mapBidder, openSellerChat } from '../lib/crowd';
import { PageTopBar } from '../components/PageTopBar';

const fmtKobo = (k: number) => naira.format(k / 100);

function SectionTitle({ icon, children, count }: { icon: IconName; children: string; count?: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-900">
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-light text-primary">
        <Icon name={icon} size={13} />
      </span>
      {children}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{count}</span>
    </h2>
  );
}

function StatTile({ label, value, tint }: { label: string; value: string | number; tint: string }) {
  return (
    <div className="rounded-xl bg-surface px-3.5 py-3">
      <p className="text-lg font-black tracking-tight text-gray-900">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tint)} />
        {label}
      </p>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-5 py-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-gray-400">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 text-[13px] font-bold text-gray-800">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

const inputCls =
  'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/10';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-500';

export default function SellerCrowdPage() {
  const nav = useNavigate();
  const sellerId = getUserId();

  const [sales, setSales] = useState<CrowdSale[]>([]);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [servables, setServables] = useState<CrowdWant[]>([]);
  const [offerId, setOfferId] = useState('');
  const [priceKobo, setPriceKobo] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'launch' | 'serve'>('launch');
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!sellerId) {
      nav('/', { replace: true });
      return;
    }
    let alive = true;
    void Promise.all([
      listCrowdSales({ seller_id: sellerId }),
      getMyOffers(sellerId, { status: 'ACTIVE' }),
      getWantsForSeller(sellerId),
    ])
      .then(([crowd, mine, serve]) => {
        if (!alive) return;
        setSales(crowd);
        setOffers(mine.offers);
        setServables(serve);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load.') });
    return () => { alive = false; };
  }, [sellerId, nav]);

  const open = useMemo(() => sales.filter((s) => s.status === 'OPEN'), [sales]);
  const closed = useMemo(() => sales.filter((s) => s.status === 'CLOSED'), [sales]);
  const totalJoined = useMemo(() => sales.reduce((sum, s) => sum + s.join_count, 0), [sales]);
  const priceNum = Number(priceKobo);
  const qtyNum = Number(qty);
  const valid = offerId.length > 0 && priceNum > 0 && qtyNum > 0;

  const openComposer = () => {
    setMode('launch');
    setComposerOpen(true);
  };

  const create = async () => {
    if (!sellerId || !valid || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createCrowdSale(sellerId, {
        offer_id: offerId,
        unit_price_kobo: priceNum,
        qty_available: qtyNum,
        note: note.trim() || undefined,
      });
      setOfferId('');
      setPriceKobo('');
      setQty('');
      setNote('');
      setComposerOpen(false);
      setSales(await listCrowdSales({ seller_id: sellerId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch crowd sale.');
    } finally {
      setCreating(false);
    }
  };

  const close = async (saleId: string) => {
    if (!sellerId || closing) return;
    setClosing(saleId);
    setError(null);
    try {
      await closeCrowdSale(saleId, sellerId);
      setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, status: 'CLOSED' } : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close crowd sale.');
    } finally {
      setClosing(null);
    }
  };

  const saleCard = (s: CrowdSale, isOpen: boolean) => (
    <li
      key={s.id}
      className="rounded-2xl bg-white p-4 transition hover:border-primary/25"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-gray-900">{s.product_name}</p>
          <p className="mt-0.5 text-[11px] font-medium text-gray-500">
            {isOpen ? 'Live right now' : 'Closed'} · {s.join_count} buyer{s.join_count === 1 ? '' : 's'} joined
          </p>
        </div>
        {isOpen && (
          <button
            type="button"
            onClick={() => void close(s.id)}
            disabled={closing === s.id}
            className={cn(
              'shrink-0 rounded-lg border border-danger/20 bg-danger/5 px-3 py-1.5 text-[11px] font-bold text-danger transition hover:bg-danger/10',
              closing === s.id && 'opacity-50',
            )}
          >
            {closing === s.id ? 'Closing…' : 'Close sale'}
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary">
          {fmtKobo(s.unit_price_kobo)}
          {s.unit ? ` / ${s.unit}` : ''}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
          {s.qty_available} available
        </span>
      </div>
      {s.note && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{s.note}</p>}
    </li>
  );

  if (!sellerId) return null;

  return (
    <div className="min-h-full bg-surface/60">
      <PageTopBar
        title="Crowd sales"
        action={
          <button
            type="button"
            onClick={openComposer}
            aria-label="New crowd sale"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-white shadow-sm transition active:scale-95"
          >
            <Icon name="plus" size={18} />
          </button>
        }
      />

      <div className="mx-auto w-full max-w-3xl md:p-0">
        <div className="px-4 pb-10 pt-4 sm:px-5 md:px-0 md:pb-0 md:pt-4">
        <div className="hidden items-center justify-between gap-3 lg:flex">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-gray-900">
              <Icon name="megaphone" size={20} className="text-primary" />
              Crowd sales
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">Group buyers together to unlock a lower unit price.</p>
          </div>
          <button
            type="button"
            onClick={openComposer}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-primary/90"
          >
            <Icon name="plus" size={15} />
            New crowd sale
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <div className="flex gap-1 rounded-2xl bg-white p-1">
          <button
            type="button"
            onClick={() => setMode('launch')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold transition',
              mode === 'launch' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            )}
          >
            <Icon name="megaphone" size={15} />
            My sales
          </button>
          <button
            type="button"
            onClick={() => setMode('serve')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold transition',
              mode === 'serve' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            )}
          >
            <Icon name="handshake" size={15} />
            Buyer wants
          </button>
        </div>

        {mode === 'serve' ? (
          <section>
            <SectionTitle icon="handshake" count={servables.length}>Buyer wants you can serve</SectionTitle>
            {servables.length === 0 ? (
              <EmptyState
                icon="handshake"
                title="No matching wants"
                sub="When a buyer's request matches one of your active offers, it appears here."
              />
            ) : (
              <ul className="space-y-2.5">
                {servables.map((w) => {
                  const mine = w.bidders.find((b) => b.seller_id === sellerId);
                  return (
                    <li
                      key={w.id}
                      className="rounded-2xl bg-white p-4 transition hover:border-primary/25"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-gray-900">{w.product_name}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-gray-500">Requested by {w.buyer_name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!mine || !sellerId) return;
                            void openSellerChat(mapWant(w), mapBidder(mine), w.buyer_name)
                              .then((t) => { nav(`/seller/negotiations/${t.id}`, { replace: true }); })
                              .catch((e) => setError(e instanceof Error ? e.message : 'Failed to open the bargain.'));
                          }}
                          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary/90"
                        >
                          Open bargain
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">
                          {w.qty}{w.unit ? ` ${w.unit}` : ''}
                        </span>
                        {w.ceiling_kobo != null && (
                          <span className="inline-flex items-center rounded-full bg-[#FFF6DA] px-2.5 py-1 text-[11px] font-bold text-[#A36A00]">
                            Up to {fmtKobo(w.ceiling_kobo)}
                          </span>
                        )}
                      </div>
                      {w.note && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{w.note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile label="Live now" value={open.length} tint="bg-primary" />
              <StatTile label="Buyers joined" value={totalJoined} tint="bg-[#2A4BD7]" />
              <StatTile label="Closed" value={closed.length} tint="bg-gray-400" />
            </div>

            <section>
              <SectionTitle icon="bolt" count={open.length}>Live crowd sales</SectionTitle>
              {open.length === 0 ? (
                <EmptyState
                  icon="megaphone"
                  title="No live crowd sales"
                  sub="Launch one and buyers will group up to unlock your price."
                />
              ) : (
                <ul className="space-y-2.5">{open.map((s) => saleCard(s, true))}</ul>
              )}
            </section>

            {composerOpen && (
              <section className="rounded-2xl bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-gray-900">Launch a crowd sale</h2>
                    <p className="mt-0.5 text-[11px] text-gray-500">Set a price and quantity — buyers group up to hit it.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setComposerOpen(false)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                    aria-label="Close composer"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>

                {offers.length === 0 ? (
                  <div className="mt-4 rounded-xl bg-surface/70 p-4">
                    <p className="text-xs font-bold text-gray-800">You need an active product offer first</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                      Crowd sales are built on your active offers. Create one to get started.
                    </p>
                    <button
                      type="button"
                      onClick={() => nav('/seller/products/new')}
                      className="mt-3 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary/90"
                    >
                      Create an offer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className={cn(labelCls, 'sm:col-span-2')}>
                        Offer
                        <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className={inputCls}>
                          <option value="">Select an active offer…</option>
                          {offers.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.product_name}{o.unit ? ` (${o.unit})` : ''} · {naira.format((o.price_cents ?? 0) / 100)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Unit price (₦)
                        <input
                          value={priceKobo}
                          onChange={(e) => setPriceKobo(e.target.value)}
                          inputMode="decimal"
                          type="number"
                          min="0"
                          placeholder="e.g. 2500"
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Quantity available
                        <input
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          inputMode="numeric"
                          type="number"
                          min="1"
                          placeholder="e.g. 50"
                          className={inputCls}
                        />
                      </label>
                      <label className={cn(labelCls, 'sm:col-span-2')}>
                        Note (optional)
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="e.g. ends Sunday"
                          className={inputCls}
                        />
                      </label>
                    </div>

                    {valid && (
                      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary-light/60 px-3 py-2 text-[11px] font-medium text-primary">
                        <Icon name="bolt" size={13} />
                        {qtyNum} units at {fmtKobo(priceNum)} {offerId ? `from "${offers.find((o) => o.id === offerId)?.product_name ?? 'your offer'}"` : ''} will open for buyers to join.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void create()}
                      disabled={!valid || creating}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="megaphone" size={15} />
                      {creating ? 'Launching…' : 'Launch crowd sale'}
                    </button>
                  </>
                )}
              </section>
            )}

            <section>
              <SectionTitle icon="clock" count={closed.length}>Closed sales</SectionTitle>
              {closed.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="No closed sales yet"
                  sub="Sales you close move here for a record of what happened."
                />
              ) : (
                <ul className="space-y-2.5">{closed.map((s) => saleCard(s, false))}</ul>
              )}
            </section>
          </>
        )}
        </div>
      </div>
    </div>
  );
}