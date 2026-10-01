import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, FormField } from '@ojaline/design';
import {
  listAds,
  createAd,
  updateAd,
  deleteAd,
  uploadImage,
  fileToBase64,
  mediaUrl,
  getMyOffers,
  getCategories,
  getClusters,
  type Ad,
  type AdFormat,
  type AdTargetType,
  type MyOffer,
  type Category,
  type Cluster,
} from '../lib/api';
import { getUser, getUserId } from '../lib/session';
import { Icon } from '../components/icons';

const DURATIONS = [3, 7, 14, 30] as const;

const fmtInt = new Intl.NumberFormat('en-US');

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function StepLabel({ n, children }: { n: number; children: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-900 text-[10px] font-black text-white">{n}</span>
      <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{children}</h3>
      <span className="h-px flex-1 bg-gray-100" />
    </div>
  );
}

function AdPreview({ format, title, body, imageKey }: { format: AdFormat; title: string; body: string; imageKey: string | null }) {
  const hasCreative = Boolean(title || body || imageKey);
  if (!hasCreative) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3.5 py-4 text-center text-[11px] text-gray-400">
        Live preview appears here as you build the ad.
      </div>
    );
  }
  if (format === 'BANNER') {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary-dark p-3.5 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">
            <Icon name="megaphone" size={9} /> Sponsored
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{title || 'Your headline'}</span>
          <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[10px] font-extrabold text-primary-dark">View</span>
        </div>
        {body && <p className="mt-1 line-clamp-1 text-[11px] text-white/85">{body}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        {imageKey ? (
          <img src={mediaUrl(imageKey) ?? ''} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-light text-primary-dark">
            <Icon name="megaphone" size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-primary-dark">
            Sponsored
          </span>
          <p className="mt-0.5 truncate text-[12px] font-bold text-gray-900">{title || 'Your headline'}</p>
          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-gray-500">{body || 'Your supporting line goes here.'}</p>
        </div>
        <span className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-white">View</span>
      </div>
      <div className="mt-2 h-[3px] rounded-full bg-gray-100">
        <div className="h-full w-2/3 rounded-full bg-primary" />
      </div>
    </div>
  );
}

function AdMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-black tracking-tight text-gray-900">{value}</p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      {sub && <p className="mt-0.5 truncate text-[9px] text-gray-400">{sub}</p>}
    </div>
  );
}

export default function AdStudio() {
  const navigate = useNavigate();
  const user = getUser();
  const userId = getUserId();
  const isSeller = Boolean(user?.seller_type);

  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [format, setFormat] = useState<AdFormat>('TOAST');
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<AdTargetType>('NONE');
  const [targetId, setTargetId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [durationDays, setDurationDays] = useState<number>(7);
  const [maxImpressions, setMaxImpressions] = useState('');

  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);

  const offerName = new Map(offers.map((o) => [o.id, o.product_name]));
  const categoryName = new Map(categories.flatMap((c) => (c.children?.length ? [c, ...c.children] : [c])).map((c) => [c.id, c.name]));
  const clusterName = new Map(clusters.map((c) => [c.id, c.name]));

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await listAds(userId);
      setAds(rows);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    void reload();
    void Promise.all([getMyOffers(userId, { status: 'ACTIVE', limit: 50 }), getCategories(), getClusters()])
      .then(([mine, cats, clus]) => {
        setOffers(mine.offers);
        setCategories(cats);
        setClusters(clus);
      })
      .catch(() => {});
  }, [userId, reload]);

  if (!isSeller) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-white p-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-light text-primary">
            <Icon name="megaphone" size={26} />
          </span>
          <h1 className="text-lg font-black text-text">Ad Studio</h1>
          <p className="mt-2 text-sm text-textSecondary">
            Promote your products with popup notices and homepage banners. Ad Studio is available to sellers — open a stall
            to start advertising.
          </p>
          <Button className="mt-6" onClick={() => navigate('/seller/products/new')}>
            Start selling
          </Button>
        </div>
      </div>
    );
  }

  const activeCount = ads.filter((a) => a.status === 'ACTIVE').length;
  const capReached = activeCount >= 3;

  const totalImpressions = ads.reduce((s, a) => s + (a.impressions_shown ?? 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.clicks_shown ?? 0), 0);
  const totalCtr = pct(totalClicks, totalImpressions);

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { data, mime } = await fileToBase64(file);
      const key = await uploadImage(data, mime);
      setImageKey(key);
      setNotice('Image uploaded — keep it under 3MB for best results.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async () => {
    if (!userId) return;
    setError(null);
    setNotice(null);
    if (!title.trim()) return setError('Give the ad a catchy title');
    if (targetType !== 'NONE' && !targetId) {
      return setError('Choose which offer or page the ad should take buyers to');
    }
    let cap: number | undefined;
    if (maxImpressions.trim()) {
      const n = Number(maxImpressions.trim());
      if (!Number.isInteger(n) || n < 1) return setError('Max impressions must be a whole number, e.g. 500');
      cap = n;
    }
    setSubmitting(true);
    try {
      await createAd(userId, {
        title: title.trim(),
        body: body.trim() || undefined,
        format,
        image_key: imageKey ?? undefined,
        target_type: targetType,
        ...(targetType !== 'NONE' && targetId ? { target_id: targetId } : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(clusterId ? { cluster_id: clusterId } : {}),
        ends_at: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        ...(cap != null ? { max_impressions: cap } : {}),
      });
      setTitle('');
      setBody('');
      setImageKey(null);
      setTargetType('NONE');
      setTargetId('');
      setCategoryId('');
      setClusterId('');
      setMaxImpressions('');
      setNotice('Ad published — it is now live and counting toward your 3-active limit.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ad');
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (ad: Ad) => {
    if (!userId) return;
    const next = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateAd(userId, ad.id, { status: next });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ad');
    }
  };

  const remove = async (ad: Ad) => {
    if (!userId) return;
    if (!window.confirm(`End "${ad.title}"? It will stop being served immediately.`)) return;
    try {
      await deleteAd(userId, ad.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ad');
    }
  };

  const targetLabel = (ad: Ad): string => {
    if (ad.target_type === 'OFFER' && ad.target_id) return offerName.get(ad.target_id) ?? 'Linked offer';
    if (ad.target_type === 'SELLER') return 'Your seller page';
    return 'Everywhere in the market';
  };

  const cardSub = (ad: Ad): string => {
    const parts: string[] = [];
    if (ad.cluster_id && clusterName.has(ad.cluster_id)) parts.push(`${clusterName.get(ad.cluster_id)}`);
    if (ad.category_id && categoryName.has(ad.category_id)) parts.push(`${categoryName.get(ad.category_id)}`);
    return parts.length > 0 ? parts.join(' · ') : 'Whole market';
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-sm">
            <Icon name="megaphone" size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">Ad Studio</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
              Popup notices and homepage banners. Aim them at an offer, a category or a market area — then watch the taps
              come in. Free for sellers in this pilot.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-primary-light px-3.5 py-2 text-[11px] font-extrabold text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {activeCount}/3 active
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-primary-light px-3 py-2 text-xs font-medium text-primary">{notice}</p>}

      <div className="mb-8 grid items-start gap-6 lg:grid-cols-[400px_1fr]">
        {/* Create form */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            className="flex flex-col gap-4"
          >
            <StepLabel n={1}>Creative</StepLabel>
            <FormField label="Ad format">
              <div className="grid grid-cols-2 gap-2">
                {(['TOAST', 'BANNER'] as AdFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                      format === f
                        ? 'border-primary bg-primary-light text-primary ring-1 ring-primary/30'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon name={f === 'TOAST' ? 'bell' : 'grid'} size={13} />
                    {f === 'TOAST' ? 'Popup toast' : 'Homepage banner'}
                  </button>
                ))}
              </div>
            </FormField>

            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fresh crayfish this weekend" required />
            <FormField label="Body" hint="One or two short lines — buyers see this in the toast.">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Market-day prices on bulk orders…"
                className="w-full resize-none rounded-lg border border-border bg-white px-3.5 py-3 text-base outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Image (optional)">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs font-medium text-textSecondary hover:border-primary">
                <Icon name="box" size={15} />
                <span className="flex-1">{uploading ? 'Uploading…' : imageKey ? 'Image attached' : 'Pick an image (jpg/png/webp/gif)'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => void pickImage(e)} className="hidden" />
              </label>
              {imageKey && (
                <img src={mediaUrl(imageKey) ?? ''} alt="Ad preview" className="mt-2 h-24 w-full rounded-lg object-cover" />
              )}
            </FormField>

            <div className="rounded-xl bg-gray-50/80 p-3">
              <p className="mb-2 text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Live preview</p>
              <AdPreview format={format} title={title} body={body} imageKey={imageKey} />
            </div>

            <StepLabel n={2}>Placement</StepLabel>
            <FormField label="Where taps go">
              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    { type: 'NONE', label: 'Everywhere', sub: 'Shown to everyone, taps go to your page', icon: 'globe' },
                    { type: 'OFFER', label: 'Link to an offer', sub: 'Taps open one of your product offers', icon: 'box' },
                    { type: 'SELLER', label: 'Your seller page', sub: 'Taps open your storefront', icon: 'store' },
                  ] as Array<{ type: AdTargetType; label: string; sub: string; icon: 'globe' | 'box' | 'store' }>
                ).map((o) => (
                  <button
                    key={o.type}
                    type="button"
                    onClick={() => {
                      setTargetType(o.type);
                      setTargetId(o.type === 'SELLER' && userId ? userId : '');
                    }}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${
                      targetType === o.type ? 'border-primary bg-primary-light ring-1 ring-primary/30' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${targetType === o.type ? 'bg-white text-primary' : 'bg-gray-100 text-gray-400'}`}>
                      <Icon name={o.icon} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${targetType === o.type ? 'text-primary' : 'text-gray-800'}`}>{o.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{o.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </FormField>

            {targetType === 'OFFER' && (
              <FormField label="Offer to link">
                {offers.length === 0 ? (
                  <p className="rounded-lg bg-surface/70 px-3 py-2.5 text-[11px] text-textSecondary">
                    You need an active product offer first.{' '}
                    <button type="button" onClick={() => navigate('/seller/products/new')} className="font-bold text-primary underline cursor-pointer">
                      Create an offer
                    </button>
                  </p>
                ) : (
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                  >
                    <option value="">Select an active offer…</option>
                    {offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.product_name}{o.unit ? ` (${o.unit})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            <StepLabel n={3}>Reach</StepLabel>
            <FormField label="Audience" hint="Leave both as “Any” to show the ad to the whole market.">
              <div className="flex flex-col gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                >
                  <option value="">Any category</option>
                  {categories.flatMap((c) => (c.children?.length ? [c, ...c.children] : [c])).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={clusterId}
                  onChange={(e) => setClusterId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                >
                  <option value="">Any market area</option>
                  {clusters.map((cl) => (
                    <option key={cl.id} value={cl.id}>{cl.name} — {cl.lga}</option>
                  ))}
                </select>
              </div>
            </FormField>

            <StepLabel n={4}>Schedule & budget</StepLabel>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Runs for">
                <select
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </FormField>
              <Input
                label="Max impressions"
                value={maxImpressions}
                onChange={(e) => setMaxImpressions(e.target.value)}
                placeholder="Unlimited"
                inputMode="numeric"
              />
            </div>

            <div className="mt-1 flex flex-col gap-2 border-t border-gray-100 pt-4">
              <Button type="submit" loading={submitting} disabled={capReached}>
                {capReached ? '3 active ads max' : 'Publish ad'}
              </Button>
              {capReached && (
                <p className="text-center text-[11px] text-textSecondary">Pause or end an ad below to free a slot.</p>
              )}
            </div>
          </form>
        </section>

        {/* My ads */}
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-black tracking-tight text-gray-900">My ads</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-extrabold text-gray-500">
                {ads.length} total
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 rounded-xl bg-gray-50/80 py-3">
              <div className="px-4 text-center">
                <p className="text-lg font-black tracking-tight text-gray-900">{fmtInt.format(totalImpressions)}</p>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Impressions</p>
              </div>
              <div className="px-4 text-center">
                <p className="text-lg font-black tracking-tight text-gray-900">{fmtInt.format(totalClicks)}</p>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Taps</p>
              </div>
              <div className="px-4 text-center">
                <p className="text-lg font-black tracking-tight text-primary">{totalCtr.toFixed(1)}%</p>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Tap rate</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-400 shadow-sm">Loading your ads…</div>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-5 py-14 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400">
                <Icon name="megaphone" size={24} />
              </span>
              <p className="mt-4 text-sm font-bold text-gray-800">No ads yet</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
                Create your first ad and it will start building impressions and taps here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {ads.map((ad) => {
                const impressions = ad.impressions_shown ?? 0;
                const clicks = ad.clicks_shown ?? 0;
                const ctr = pct(clicks, impressions);
                const cap = ad.max_impressions ?? null;
                const capProgress = cap != null ? Math.min(pct(impressions, cap), 100) : null;
                const endMs = Date.parse(ad.ends_at);
                const startMs = Date.parse(ad.starts_at);
                const windowDays = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs
                  ? Math.round((endMs - startMs) / 86400000)
                  : 0;
                const isLive = ad.status === 'ACTIVE';
                const daysLeft = isLive && !Number.isNaN(endMs)
                  ? Math.max(Math.ceil((endMs - Date.now()) / 86400000), 0)
                  : 0;
                const rate = isLive && windowDays > 0 ? impressions / Math.max(windowDays - daysLeft, 1) : impressions / Math.max(windowDays, 1);
                return (
                  <li key={ad.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-start gap-3.5">
                      {ad.image_key ? (
                        <img src={mediaUrl(ad.image_key) ?? ''} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                          <Icon name="megaphone" size={20} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-gray-900">{ad.title}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                              ad.status === 'ACTIVE'
                                ? 'bg-primary-light text-primary'
                                : ad.status === 'PAUSED'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {ad.status === 'ACTIVE' ? (daysLeft > 0 ? `Live · ${daysLeft}d left` : 'Live') : ad.status}
                          </span>
                        </div>
                        {ad.body && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{ad.body}</p>}
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                          <Icon name={ad.format === 'BANNER' ? 'grid' : 'bell'} size={10} />
                          {ad.format === 'BANNER' ? 'Homepage banner' : 'Popup toast'} · {fmtDate(ad.starts_at)} – {fmtDate(ad.ends_at)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                          <Icon name="globe" size={10} />
                          {targetLabel(ad)} · {cardSub(ad)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {(ad.status === 'ACTIVE' || ad.status === 'PAUSED') && (
                          <Button variant="secondary" size="sm" onClick={() => void toggle(ad)}>
                            {ad.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                          </Button>
                        )}
                        {ad.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => void remove(ad)}
                            className="bg-transparent text-[11px] font-semibold text-danger border-none cursor-pointer hover:underline"
                          >
                            End ad
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3.5 rounded-xl bg-gray-50/80 p-3.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Performance</p>
                        {capProgress != null ? (
                          <p className="text-[9px] font-bold text-gray-400">{fmtInt.format(impressions)} / {fmtInt.format(cap ?? 0)} shown</p>
                        ) : (
                          <p className="text-[9px] font-bold text-gray-400">{fmtInt.format(impressions)} shown</p>
                        )}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full transition-all ${capProgress != null && capProgress >= 95 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${capProgress ?? (impressions > 0 ? 100 : 0)}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <AdMetric label="Impressions" value={fmtInt.format(impressions)} sub={isLive ? `~${Math.round(rate)}/day` : undefined} />
                        <AdMetric label="Taps" value={fmtInt.format(clicks)} />
                        <AdMetric label="Tap rate" value={`${ctr.toFixed(1)}%`} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}