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

/**
 * Sniff the real image format from the file's magic bytes instead of trusting
 * the client's claimed mime. Blocks renamed/scraped non-image files (scripts,
 * text, archives renamed to .jpg) that would otherwise sail past the size and
 * extension checks — a first, cheap fraud control on top of camera-first UX.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 6 &&
    (buf.toString('latin1', 0, 6) === 'GIF87a' || buf.toString('latin1', 0, 6) === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
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

  // Real-image check: reject anything whose bytes are not actually an image.
  const sniffed = sniffImageMime(buf);
  const claimed = mime.toLowerCase();
  if (!sniffed) {
    throw new Error('File is not a real image — only JPG, PNG, WEBP and GIF photos are allowed.');
  }
  if (sniffed !== claimed) {
    throw new Error(`Image content (${sniffed}) does not match the declared type (${claimed})`);
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