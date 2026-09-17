import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, FormField } from '@ojaline/design';
import { listAds, createAd, updateAd, deleteAd, uploadImage, fileToBase64, mediaUrl, type Ad, type AdFormat } from '../lib/api';
import { getUser, getUserId } from '../lib/session';
import { Icon } from '../components/icons';

const Naira = Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
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
    if (userId) void reload();
    else setLoading(false);
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
    setSubmitting(true);
    try {
      await createAd(userId, {
        title: title.trim(),
        body: body.trim() || undefined,
        format,
        image_key: imageKey ?? undefined,
        target_type: 'NONE',
      });
      setTitle('');
      setBody('');
      setImageKey(null);
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

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-text">Ad Studio</h1>
          <span className="rounded-full bg-primary-light px-3 py-1 text-[11px] font-bold text-primary">
            {activeCount}/3 active
          </span>
        </div>
        <p className="text-sm text-textSecondary">
          Popup notices and homepage banners that reach every buyer. Free for sellers in this pilot.
        </p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-primary-light px-3 py-2 text-xs font-medium text-primary">{notice}</p>}

      <div className="mb-8 grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Create form */}
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-4 text-base font-black text-text">New ad</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            className="flex flex-col gap-4"
          >
            <FormField label="Ad format">
              <div className="grid grid-cols-2 gap-2">
                {(['TOAST', 'BANNER'] as AdFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                      format === f ? 'border-primary bg-primary-light text-primary' : 'border-border bg-white text-textSecondary'
                    }`}
                  >
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
                className="w-full rounded-lg border border-border bg-white px-3.5 py-3 text-base outline-none focus:border-primary"
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

            <Button type="submit" loading={submitting} disabled={capReached}>
              {capReached ? '3 active ads max' : 'Publish ad'}
            </Button>
            {capReached && (
              <p className="-mt-2 text-[11px] text-textSecondary">
                Pause or end an ad below to free a slot.
              </p>
            )}
          </form>
        </section>

        {/* My ads */}
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="mb-4 text-base font-black text-text">My ads</h2>
          {loading ? (
            <p className="text-sm text-textSecondary">Loading your ads…</p>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface text-textSecondary">
                <Icon name="megaphone" size={22} />
              </span>
              <p className="text-sm font-semibold text-text">No ads yet</p>
              <p className="mt-1 text-xs text-textSecondary">Create your first ad to start reaching every buyer in the market.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {ads.map((ad) => (
                <li key={ad.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                  {ad.image_key ? (
                    <img src={mediaUrl(ad.image_key) ?? ''} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
                      <Icon name="megaphone" size={20} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-text">{ad.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          ad.status === 'ACTIVE'
                            ? 'bg-primary-light text-primary'
                            : ad.status === 'PAUSED'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-surface text-textSecondary'
                        }`}
                      >
                        {ad.status}
                      </span>
                    </div>
                    {ad.body && <p className="mt-0.5 line-clamp-1 text-xs text-textSecondary">{ad.body}</p>}
                    <p className="mt-1 text-[10px] text-textSecondary">
                      {ad.format} · {fmtDate(ad.starts_at)} – {fmtDate(ad.ends_at)}
                      {typeof ad.impressions_shown === 'number' ? ` · ${ad.impressions_shown} shown` : ''}
                    </p>
                    <p className="mt-1 text-[10px] text-textSecondary">
                      {ad.max_impressions != null ? `Max ${ad.max_impressions} impressions` : 'Unlimited impressions'} ·{' '}
                      {Naira.format(0)} cost
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
                        className="text-[11px] font-semibold text-danger bg-transparent border-none cursor-pointer hover:underline"
                      >
                        End ad
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}