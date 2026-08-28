import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

const STORAGE_DIR = join(process.cwd(), 'storage');

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
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(STORAGE_DIR, safe);

    if (!existsSync(filePath)) throw new NotFoundException('Not found');

    const ext = safe.substring(safe.lastIndexOf('.'));
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(filePath).pipe(res);
  }
}
