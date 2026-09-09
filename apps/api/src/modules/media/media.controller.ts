import { Controller, Get, Post, Param, Body, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { createReadStream, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STORAGE_DIR = join(process.cwd(), 'storage');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

@Controller('media')
export class MediaController {
  @Get(':key')
  serve(@Param('key') key: string, @Res() res: any) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(STORAGE_DIR, safe);

    if (!existsSync(filePath)) throw new NotFoundException('Not found');

    const ext = safe.substring(safe.lastIndexOf('.'));
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(filePath).pipe(res);
  }

  /**
   * Minimal image upload (ADR-009): JSON base64 body keeps the prototype free
   * of a multipart dependency. Allowlisted mime types, 1B–3MB, written into
   * the same flat storage dir that GET /media/:key serves.
   */
  @Post()
  async upload(@Body() body: { data?: string; mime?: string }) {
    const mime = (body.mime ?? 'image/jpeg').toLowerCase();
    const ext = EXT_BY_MIME[mime];
    if (!ext) throw new BadRequestException(`Unsupported image type: ${mime}`);

    if (typeof body.data !== 'string' || body.data.length === 0) {
      throw new BadRequestException('Image data (base64) is required');
    }
    const buf = Buffer.from(body.data, 'base64');
    if (buf.byteLength === 0) throw new BadRequestException('Image data is empty');
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`Image must be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`);
    }

    const storageKey = `${randomUUID()}${ext}`;
    writeFileSync(join(STORAGE_DIR, storageKey), buf);
    return { storage_key: storageKey };
  }
}
