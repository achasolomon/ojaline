import { Controller, Get, Post, Param, Body, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import { AuthRequired } from '../auth/auth-guards.js';
import { STORAGE_DIR, safeKey, saveImage } from './storage.js';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

@Controller('media')
export class MediaController {
  @Get(':key')
  serve(@Param('key') key: string, @Res() res: any) {
    const safe = safeKey(key);
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
   * the same flat storage dir that GET /media/:key serves. Authenticated so
   * only signed-in users can consume disk space.
   */
  @Post()
  @AuthRequired()
  async upload(@Body() body: { data?: string; mime?: string }) {
    try {
      const saved = await saveImage(body.data ?? '', body.mime ?? 'image/jpeg');
      return { storage_key: saved.storage_key };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Image could not be stored');
    }
  }
}