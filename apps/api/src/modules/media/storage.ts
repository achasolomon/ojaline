import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const STORAGE_DIR = join(process.cwd(), 'storage');

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const MEDIA_KEY_RE = /^[0-9a-zA-Z.-]{8,100}\.(jpg|jpeg|png|webp|gif)$/i;

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Extension for an allowed image mime, or null when unsupported. */
export function extensionFor(mime: string): string | null {
  return EXT_BY_MIME[mime.toLowerCase()] ?? null;
}

/** Sanitise a media key so it can never escape the storage directory. */
export function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '');
}

/** Persist a base64 image and return its storage key + byte length. */
export async function saveImage(data: string, mime: string): Promise<{ storage_key: string; bytes: number }> {
  const ext = extensionFor(mime);
  if (!ext) throw new Error(`Unsupported image type: ${mime}`);
  if (typeof data !== 'string' || data.length === 0) throw new Error('Image data (base64) is required');

  const buf = Buffer.from(data, 'base64');
  if (buf.byteLength === 0) throw new Error('Image data is empty');
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
  }

  const storageKey = `${randomUUID()}${ext}`;
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.writeFile(join(STORAGE_DIR, storageKey), buf);
  return { storage_key: storageKey, bytes: buf.byteLength };
}

/** Best-effort delete of a stored image by key; ignores missing files. */
export async function removeStoredFile(key: string): Promise<void> {
  if (!MEDIA_KEY_RE.test(key)) return;
  try {
    await fs.unlink(join(STORAGE_DIR, safeKey(key)));
  } catch {
    /* already gone */
  }
}