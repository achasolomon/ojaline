import { useRef, useState } from 'react';
import { fileToBase64, mediaUrl, uploadImage } from '../../lib/api';
import { Icon } from '../icons';

export interface MediaEntry {
  /** Present when this photo already exists on the offer (edit mode). */
  id?: string;
  storage_key: string;
  is_primary?: boolean;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Multi-photo picker shared by create/offer edit. Uploads immediately on pick
 * so "Create" stays one final API call; min/max defaults match the catalog
 * rules (2 required, 8 allowed). The first photo added becomes the primary.
 */
export function MediaPicker({
  value,
  onChange,
  min = 2,
  max = 8,
  disabled,
}: {
  value: MediaEntry[];
  onChange: (next: MediaEntry[]) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = max - value.length;
    if (room <= 0) return;
    const toAdd = Array.from(files).slice(0, room);
    setUploading(true);
    const added: MediaEntry[] = [];
    try {
      for (const file of toAdd) {
        if (!ACCEPT.includes(file.type)) {
          setError(`"${file.name}" isn't a supported image type — use JPG, PNG, WEBP or GIF.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" is larger than 3MB. Pick a smaller photo.`);
          continue;
        }
        const { data, mime } = await fileToBase64(file);
        const key = await uploadImage(data, mime);
        added.push({ storage_key: key, is_primary: value.length === 0 && added.length === 0 });
      }
    } catch {
      setError('Could not upload one or more photos — check your connection and try again.');
    } finally {
      setUploading(false);
    }
    if (added.length > 0) onChange([...value, ...added]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const makePrimary = (entry: MediaEntry) => {
    onChange(value.map((it) => ({ ...it, is_primary: it.storage_key === entry.storage_key })));
  };

  const remove = (entry: MediaEntry) => {
    const next = value.filter((it) => it.storage_key !== entry.storage_key);
    if (entry.is_primary && next.length > 0) next[0] = { ...next[0], is_primary: true };
    onChange(next);
  };

  const primary = value.find((it) => it.is_primary);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((entry) => (
          <div
            key={entry.storage_key}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface"
          >
            <img src={mediaUrl(entry.storage_key) ?? undefined} alt="" className="h-full w-full object-cover" />
            {entry.is_primary && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">
                <Icon name="star" size={8} /> MAIN
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(entry)}
              disabled={disabled}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-gray-900/70 text-white transition hover:bg-danger"
              aria-label="Remove photo"
            >
              <Icon name="trash" size={12} />
            </button>
            {!entry.is_primary && value.length > 1 && (
              <button
                type="button"
                onClick={() => makePrimary(entry)}
                disabled={disabled}
                className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
              >
                Make main photo
              </button>
            )}
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={pick}
            disabled={disabled || uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface/60 text-textSecondary transition hover:border-primary/40 hover:text-primary"
          >
            {uploading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-[10px] font-medium">Uploading…</span>
              </>
            ) : (
              <>
                <Icon name="plus" size={18} />
                <span className="text-[10px] font-semibold">Add photo</span>
              </>
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        {value.length >= min ? (
          <>
            {value.length}/{max} photos ·{' '}
            <span className="text-primary">
              {primary ? 'the MAIN tag sets your listing cover photo' : 'pick a main photo'}
            </span>
          </>
        ) : (
          <span className="font-medium text-danger">Add at least {min} clear photos of the product</span>
        )}
      </p>
      {error && <p className="mt-1 text-[11px] font-medium text-danger">{error}</p>}
    </div>
  );
}