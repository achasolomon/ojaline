import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStorefront, mediaUrl, fileToBase64, uploadImage, updateSellerAppearance, type Seller } from '../lib/api';
import { getUserId } from '../lib/session';
import { Icon } from '../components/icons';

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };
    input.click();
  });
}

/** Customise how your storefront looks to buyers — profile photo + banner. */
export default function SellerAppearancePage() {
  const nav = useNavigate();
  const userId = getUserId();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pendingRef = useRef<{ profile_photo_url?: string | null; banner_url?: string | null }>({});

  useEffect(() => {
    if (!userId) {
      nav('/', { replace: true });
      return;
    }
    let alive = true;
    getStorefront(userId)
      .then((s) => {
        if (alive) setSeller(s);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your storefront.');
      });
    return () => {
      alive = false;
    };
  }, [userId, nav]);

  const applyUpload = async (kind: 'profile_photo_url' | 'banner_url', file: File) => {
    setError(null);
    setSaved(false);
    const { data, mime } = await fileToBase64(file);
    const key = await uploadImage(data, mime);
    pendingRef.current[kind] = key;
    setDirty(true);
    if (seller) setSeller((s) => (s ? { ...s, [kind]: key } : s));
  };

  const handlePick = async (kind: 'profile_photo_url' | 'banner_url') => {
    try {
      setBusy(true);
      const file = await pickImage();
      if (file) await applyUpload(kind, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try a smaller image.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (kind: 'profile_photo_url' | 'banner_url') => {
    pendingRef.current[kind] = null;
    setDirty(true);
    setSaved(false);
    if (seller) setSeller((s) => (s ? { ...s, [kind]: null } : s));
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateSellerAppearance(pendingRef.current);
      pendingRef.current = {};
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  };

  const photoUrl = seller?.profile_photo_url ? mediaUrl(seller.profile_photo_url) : null;
  const bannerUrl = seller?.banner_url ? mediaUrl(seller.banner_url) : null;

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900">Storefront appearance</h1>
          <p className="text-xs text-gray-500">
            Your photo and banner show on your storefront and next to your offers and bargaining chats.
          </p>
        </div>
        <button
          type="button"
          onClick={() => nav('/seller/storefront')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Icon name="store" size={14} />
          Preview storefront
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
      )}
      {saved && (
        <div className="rounded-lg border border-green-200 bg-[#D6F5E7] px-3 py-2 text-xs font-medium text-[#087A38]">
          Your storefront look has been updated.
        </div>
      )}

      {/* Profile photo */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900">Profile photo</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              A square photo buyers see on your storefront, on your offers and in bargaining.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePick('profile_photo_url')}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? 'Uploading…' : 'Upload photo'}
              </button>
              {photoUrl && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove('profile_photo_url')}
                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="w-28 shrink-0">
            <div className="aspect-square overflow-hidden rounded-full border-2 border-gray-100 bg-gray-50">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile preview" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-gray-300">
                  <Icon name="user" size={32} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Banner */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900">Storefront banner</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          A wide banner at the top of your storefront. Photos between 16:6 and 4:1 work best (e.g. 1600 × 600).
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
          {bannerUrl ? (
            <div
              className="aspect-[5/2] w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerUrl})` }}
              role="img"
              aria-label="Banner preview"
            />
          ) : (
            <div className="grid aspect-[5/2] w-full place-items-center bg-gradient-to-r from-gray-100 to-gray-50 text-gray-300">
              <Icon name="store" size={32} />
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handlePick('banner_url')}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? 'Uploading…' : 'Upload banner'}
          </button>
          {bannerUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleRemove('banner_url')}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => {
              pendingRef.current = {};
              setDirty(false);
              setError(null);
              setSaved(false);
              if (userId && seller) getStorefront(userId).then(setSeller).catch(() => {});
            }}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => void handleSave()}
          className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}