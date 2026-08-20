import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, FormField } from '@ojaline/design';
import { createOffer } from '../lib/api';
import type { Channel, Perishability, FulfilmentMode } from '../lib/api';

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const CLUSTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'd1000000-0000-4000-8000-000000000001', label: 'Yaba' },
  { value: 'd1000000-0000-4000-8000-000000000002', label: 'Surulere' },
  { value: 'd1000000-0000-4000-8000-000000000003', label: 'Ikeja' },
];

const SELLER_OPTIONS: { value: string; label: string }[] = [
  { value: 'a1000000-0000-4000-8000-000000000001', label: 'Seller A (Lagos Central)' },
  { value: 'a1000000-0000-4000-8000-000000000002', label: 'Seller B (Lagos West)' },
  { value: 'a1000000-0000-4000-8000-000000000003', label: 'Seller C (Lagos North)' },
];

const PERISHABILITY_OPTIONS: { value: Perishability; label: string; description: string }[] = [
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days', description: 'Grains, tubers, dried goods' },
  { value: 'SHELF_LT_7D', label: 'Perishable (< 7 days)', description: 'Fresh produce, vegetables' },
];

const FULFILMENT_MODES: { value: FulfilmentMode; label: string }[] = [
  { value: 'INSTANT', label: 'Instant (2-3h)' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'MARKET_DAY', label: 'Market Day' },
];

export default function CreateOffer() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productName, setProductName] = useState('');
  const [physicalRef, setPhysicalRef] = useState('');
  const [priceNaira, setPriceNaira] = useState('');
  const [channel, setChannel] = useState<Channel>('RETAILER');
  const [availableQty, setAvailableQty] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [perishability, setPerishability] = useState<Perishability>('SHELF_GT_7D');
  const [fulfilmentModes, setFulfilmentModes] = useState<FulfilmentMode[]>(['INSTANT']);
  const [sellerId, setSellerId] = useState(SELLER_OPTIONS[0].value);
  const [clusterId, setClusterId] = useState(CLUSTER_OPTIONS[0].value);

  const toggleFulfilment = (mode: FulfilmentMode) => {
    setFulfilmentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productName.trim()) return setError('Product name is required');
    if (!physicalRef.trim()) return setError('Physical reference is required');
    const price = Math.round(parseFloat(priceNaira) * 100);
    if (isNaN(price) || price <= 0) return setError('Price must be a positive number');
    const qty = parseInt(availableQty, 10);
    if (isNaN(qty) || qty <= 0) return setError('Available quantity must be positive');
    const minQty = parseInt(minOrderQty, 10);
    if (isNaN(minQty) || minQty <= 0) return setError('Min order quantity must be positive');
    if (fulfilmentModes.length === 0) return setError('Select at least one fulfilment mode');

    setSubmitting(true);
    try {
      await createOffer({
        seller_id: sellerId,
        product_name: productName.trim(),
        physical_ref: physicalRef.trim(),
        channel,
        available_qty: qty,
        min_order_qty: minQty,
        perishability,
        fulfilment_modes: fulfilmentModes,
        cluster_id: clusterId,
        price_cents: price,
      });
      navigate('/offers');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Create Offer</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Product Name">
            <Input
              placeholder="e.g. Fresh Tomatoes"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </FormField>

          <FormField label="Physical Reference">
            <Input
              placeholder="e.g. Grade A, Ibadan origin"
              value={physicalRef}
              onChange={(e) => setPhysicalRef(e.target.value)}
            />
          </FormField>

          <FormField label="Price (Naira per unit)">
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 1200"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
            />
          </FormField>

          <FormField label="Seller">
            <div className="flex flex-col gap-2">
              {SELLER_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    sellerId === s.value ? 'border-primary bg-primaryLight' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="seller"
                    checked={sellerId === s.value}
                    onChange={() => setSellerId(s.value)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">{s.label}</span>
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Cluster">
            <div className="flex gap-2">
              {CLUSTER_OPTIONS.map((cl) => (
                <button
                  key={cl.value}
                  type="button"
                  onClick={() => setClusterId(cl.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    clusterId === cl.value
                      ? 'border-primary bg-primaryLight text-primary'
                      : 'border-border text-textSecondary'
                  }`}
                >
                  {cl.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Channel">
            <div className="flex flex-col gap-2">
              {CHANNELS.map((ch) => (
                <label
                  key={ch.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    channel === ch.value ? 'border-primary bg-primaryLight' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === ch.value}
                    onChange={() => setChannel(ch.value)}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm font-medium">{ch.label}</span>
                </label>
              ))}
            </div>
          </FormField>

          <div className="flex gap-3">
            <FormField label="Available Qty" className="flex-1">
              <Input
                type="number"
                min="1"
                placeholder="e.g. 500"
                value={availableQty}
                onChange={(e) => setAvailableQty(e.target.value)}
              />
            </FormField>
            <FormField label="Min Order Qty" className="flex-1">
              <Input
                type="number"
                min="1"
                placeholder="e.g. 10"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Perishability">
            <div className="flex flex-col gap-2">
              {PERISHABILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    perishability === opt.value ? 'border-primary bg-primaryLight' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="perishability"
                    checked={perishability === opt.value}
                    onChange={() => setPerishability(opt.value)}
                    className="w-4 h-4 text-primary"
                  />
                  <div>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <p className="text-xs text-textSecondary">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Fulfilment Modes">
            <div className="flex gap-2">
              {FULFILMENT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => toggleFulfilment(mode.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    fulfilmentModes.includes(mode.value)
                      ? 'border-primary bg-primaryLight text-primary'
                      : 'border-border text-textSecondary'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </FormField>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <Button type="submit" size="lg" loading={submitting} disabled={submitting}>
            Create Offer
          </Button>
        </form>
      </main>
    </div>
  );
}
