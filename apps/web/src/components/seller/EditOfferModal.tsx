import { useEffect, useState } from 'react';
import {
  addOfferMedia,
  getCategories,
  getClusters,
  getLgas,
  getMarkets,
  getOfferById,
  getStates as getClusterStates,
  removeOfferMedia,
  setOfferPrimary,
  updateOffer,
  type Category,
  type Channel,
  type Cluster,
  type FulfilmentMode,
  type LgaLocation,
  type Market,
  type MyOffer,
  type Perishability,
  type StateLocation,
} from '../../lib/api';
import { Icon } from '../icons';
import { MediaPicker, type MediaEntry } from './MediaPicker';

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const PERISHABILITY: { value: Perishability; label: string }[] = [
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days' },
  { value: 'SHELF_LT_7D', label: 'Perishable (< 7 days)' },
];

const FULFILMENT_MODES: { value: FulfilmentMode; label: string }[] = [
  { value: 'INSTANT', label: 'Instant (2-3h)' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'MARKET_DAY', label: 'Market Day' },
];

export function EditOfferModal({
  offer,
  onClose,
  onSaved,
}: {
  offer: MyOffer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const [productName, setProductName] = useState(offer.product_name);
  const [physicalRef, setPhysicalRef] = useState(offer.physical_ref);
  const [description, setDescription] = useState(offer.description ?? '');
  const [unit, setUnit] = useState(offer.unit ?? '');
  const [priceNaira, setPriceNaira] = useState((offer.price_cents ?? 0) / 100);
  const [availableQty, setAvailableQty] = useState(offer.available_qty);
  const [minOrderQty, setMinOrderQty] = useState(offer.min_order_qty);
  const [channel, setChannel] = useState<Channel>(offer.channel);
  const [perishability, setPerishability] = useState<Perishability>(offer.perishability);
  const [fulfilmentModes, setFulfilmentModes] = useState<FulfilmentMode[]>(offer.fulfilment_modes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(offer.category_id ?? '');

  const [media, setMedia] = useState<MediaEntry[]>([]);

  const [states, setStates] = useState<StateLocation[]>([]);
  const [stateName, setStateName] = useState('');
  const [lgas, setLgas] = useState<LgaLocation[]>([]);
  const [lga, setLga] = useState('');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState(offer.cluster_id);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketId, setMarketId] = useState(offer.market_id ?? '');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getOfferById(offer.id), getCategories(), getClusterStates()]).then(([detail, cats, sts]) => {
      if (cancelled) return;
      setCategories(cats);
      setStates(sts);
      setDescription(detail.description ?? '');
      setMedia((detail.images ?? []).map((img) => ({ id: img.id, storage_key: img.storage_key, is_primary: img.is_primary })));
      if (detail.state) setStateName(detail.state);
      if (detail.lga) setLga(detail.lga);
      if (detail.cluster_id) setClusterId(detail.cluster_id);
      if (detail.market_id) setMarketId(detail.market_id);
      setCategoryId((prev) => prev || detail.category_id || '');
      setLoaded(true);
    }, (err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Could not load listing details');
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [offer.id]);

  useEffect(() => {
    if (!stateName) return setLgas([]);
    void getLgas(stateName).then(setLgas, () => setLgas([]));
  }, [stateName]);

  useEffect(() => {
    if (!stateName || !lga) return setClusters([]);
    void getClusters(stateName, lga).then(setClusters, () => setClusters([]));
  }, [stateName, lga]);

  useEffect(() => {
    if (!clusterId) return setMarkets([]);
    void getMarkets(clusterId).then(setMarkets, () => setMarkets([]));
  }, [clusterId]);

  const categoryOptions = categories.flatMap((top) => [
    { id: top.id, label: top.name },
    ...(top.children ?? []).map((child) => ({ id: child.id, label: `${top.name} · ${child.name}` })),
  ]);

  const handleState = (value: string) => {
    setStateName(value);
    setLga('');
    setClusterId('');
    setMarketId('');
  };
  const handleLga = (value: string) => {
    setLga(value);
    setClusterId('');
    setMarketId('');
  };
  const handleCluster = (value: string) => {
    setClusterId(value);
    setMarketId('');
  };

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary';

  const toggleFulfilment = (mode: FulfilmentMode) => {
    setFulfilmentModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productName.trim()) return setError('Product name is required');
    const price = Math.round(Number(priceNaira) * 100);
    if (isNaN(price) || price <= 0) return setError('Price must be a positive number');
    const qty = parseInt(String(availableQty), 10);
    if (isNaN(qty) || qty < 0) return setError('Available quantity must be zero or more');
    const minQty = parseInt(String(minOrderQty), 10);
    if (isNaN(minQty) || minQty < 1) return setError('Min order quantity must be at least 1');
    if (fulfilmentModes.length === 0) return setError('Select at least one fulfilment mode');
    if (!clusterId) return setError('Choose where you sell from');

    setSubmitting(true);
    try {
      const initialMedia = media; // current value reflects any local adds/removes
      const removed = (offer.images ?? []).filter((img) => !initialMedia.some((m) => m.id === img.id));
      const added = initialMedia.filter((m) => !m.id);
      const prevPrimary = (offer.images ?? []).find((img) => img.is_primary)?.id;
      const nextPrimary = initialMedia.find((m) => m.is_primary);

      for (const img of removed) {
        if (img.id) await removeOfferMedia(offer.id, img.id);
      }
      for (const entry of added) {
        await addOfferMedia(offer.id, entry.storage_key, entry.is_primary === true);
      }
      if (
        nextPrimary?.id &&
        prevPrimary &&
        prevPrimary !== nextPrimary.id &&
        !removed.some((r) => r.id === prevPrimary)
      ) {
        await setOfferPrimary(offer.id, nextPrimary.id);
      }

      await updateOffer(offer.id, {
        product_name: productName.trim(),
        physical_ref: physicalRef.trim() || undefined,
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        available_qty: qty,
        min_order_qty: minQty,
        channel,
        perishability,
        fulfilment_modes: fulfilmentModes,
        price_cents: price,
        cluster_id: clusterId,
        market_id: marketId || null,
        category_id: categoryId || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-text">Edit offer</h2>
          <button type="button" onClick={onClose} className="p-1 text-textSecondary transition hover:text-text">
            <Icon name="close" size={18} />
          </button>
        </div>

        {!loaded ? (
          <p className="py-6 text-center text-sm text-textSecondary">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary sm:col-span-2">
                Product name
                <input className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary sm:col-span-2">
                Category
                <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">No category</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Unit
                <input className={inputCls} placeholder="e.g. basket, crate" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Physical reference
                <input className={inputCls} value={physicalRef} onChange={(e) => setPhysicalRef(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary sm:col-span-2">
                About this product
                <textarea
                  className={`${inputCls} min-h-[72px] resize-y`}
                  placeholder="Where it's grown, what it's good for…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary sm:col-span-2">
                Photos
                <MediaPicker value={media} onChange={setMedia} min={1} max={8} disabled={submitting} />
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Price (₦ per unit)
                <input type="number" min="1" step="0.01" className={inputCls} value={priceNaira} onChange={(e) => setPriceNaira(parseFloat(e.target.value))} />
              </label>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                  Available qty
                  <input type="number" min="0" className={inputCls} value={availableQty} onChange={(e) => setAvailableQty(parseInt(e.target.value, 10))} />
                </label>
                <label className="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                  Min order
                  <input type="number" min="1" className={inputCls} value={minOrderQty} onChange={(e) => setMinOrderQty(parseInt(e.target.value, 10))} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Channel
                <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Perishability
                <select className={inputCls} value={perishability} onChange={(e) => setPerishability(e.target.value as Perishability)}>
                  {PERISHABILITY.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">Fulfilment modes</span>
              <div className="flex flex-wrap gap-2">
                {FULFILMENT_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => toggleFulfilment(mode.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${fulfilmentModes.includes(mode.value) ? 'border-primary bg-primary-light text-primary' : 'border-border text-textSecondary'}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">Where you sell from</span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <select className={inputCls} value={stateName} onChange={(e) => handleState(e.target.value)}>
                  <option value="">State…</option>
                  {states.map((s) => (
                    <option key={s.state} value={s.state}>{s.state}</option>
                  ))}
                </select>
                <select className={inputCls} value={lga} onChange={(e) => handleLga(e.target.value)} disabled={!stateName}>
                  <option value="">Local government…</option>
                  {lgas.map((l) => (
                    <option key={l.lga} value={l.lga}>{l.lga}</option>
                  ))}
                </select>
                <select className={inputCls} value={clusterId} onChange={(e) => handleCluster(e.target.value)} disabled={!lga}>
                  <option value="">Nearest market area…</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.lga !== lga ? ` (${c.lga})` : ''}</option>
                  ))}
                </select>
                <select className={inputCls} value={marketId} onChange={(e) => setMarketId(e.target.value)} disabled={!clusterId}>
                  <option value="">Attach a market (optional)…</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.is_open_today ? ' · open today' : m.next_date ? ` · next ${new Date(m.next_date).toLocaleDateString('en-NG', { weekday: 'short' })}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {fulfilmentModes.includes('MARKET_DAY') && !marketId && (
                <p className="text-[11px] font-medium text-amber-600">Market Day listings should be attached to a market.</p>
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-textSecondary transition hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}