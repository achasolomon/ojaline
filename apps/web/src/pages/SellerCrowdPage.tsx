import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { Icon } from '../components/icons';
import { getUserId } from '../lib/session';
import { cn } from '../lib/cn';
import {
  createCrowdSale,
  listCrowdSales,
  closeCrowdSale,
  getMyOffers,
  type CrowdSale,
  type MyOffer,
} from '../lib/api';

const fmtKobo = (k: number) => naira.format(k / 100);

export default function SellerCrowdPage() {
  const nav = useNavigate();
  const sellerId = getUserId();


  const [sales, setSales] = useState<CrowdSale[]>([]);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [offerId, setOfferId] = useState('');
  const [priceKobo, setPriceKobo] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sellerId) {
      nav('/', { replace: true });
      return;
    }
    let alive = true;
    void Promise.all([
      listCrowdSales({ seller_id: sellerId }),
      getMyOffers(sellerId, { status: 'ACTIVE' }),
    ])
      .then(([crowd, mine]) => {
        if (!alive) return;
        setSales(crowd);
        setOffers(mine.offers);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load.') });
    return () => { alive = false; };
  }, [sellerId, nav]);

  const open = useMemo(() => sales.filter((s) => s.status === 'OPEN'), [sales]);
  const closed = useMemo(() => sales.filter((s) => s.status === 'CLOSED'), [sales]);
  const priceNum = Number(priceKobo);
  const qtyNum = Number(qty);
  const valid = offerId.length > 0 && priceNum > 0 && qtyNum > 0;

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

  const renderSale = (s: CrowdSale, isOpen: boolean) => (
    <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{s.product_name}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {fmtKobo(s.unit_price_kobo)}{s.unit ? ` / ${s.unit}` : '} · {s.qty_available} available · {s.join_count} joined{s.note ? ` · ${s.note}` : '}
        </p>
      </div>
      {isOpen && (
        <button type="button" onClick={() => void close(s.id)} disabled={closing === s.id} className={cn('rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50', closing === s.id && 'opacity-50')}>
          {closing === s.id ? 'Closing…' : 'Close'}
        </button>
      )}
    </li>
  );

  if (!sellerId) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Icon name="users" className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-gray-900">Crowd sales</h1>
      </div>
      <p className="text-sm text-gray-500">Drop a unit price and let buyers group up to unlock it.</p>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Launch a new crowd sale</h2>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-600">Offer
            <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select an active offer…</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.product_name}{o.unit ? " (" + o.unit + ")" : ""} · {naira.format((o.price_cents ?? 0) / 100)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600">Unit price (₦)
            <input value={priceKobo} onChange={(e) => setPriceKobo(e.target.value)} inputMode="decimal" type="number" min="0" placeholder="e.g. 2500" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-600">Quantity available
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" type="number" min="1" placeholder="e.g. 50" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-600">Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ends Sunday" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <button type="button" onClick={() => void create()} disabled={!valid || creating} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
          {creating ? 'Creating…' : 'Launch crowd sale'}
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Live ({open.length})</h2>
        {open.length === 0 ? <p className="text-xs text-gray-400">No live crowd sales.</p> : <ul className="space-y-2">{open.map((s) => renderSale(s, true))}</ul>}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Closed ({closed.length})</h2>
        {closed.length === 0 ? <p className="text-xs text-gray-400">No closed crowd sales.</p> : <ul className="space-y-2">{closed.map((s) => renderSale(s, false))}</ul>}
      </section>
    </div>
  );
}
