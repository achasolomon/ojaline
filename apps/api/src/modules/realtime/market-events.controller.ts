import { Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { AuthService } from '../auth/auth.service.js';
import { MarketFeedService, MARKET_CHANNEL, SYSTEM_CHANNEL } from './market-feed.service.js';

@Controller('events')
export class MarketEventsController {
  private readonly config = loadConfig();

  constructor(
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('recent')
  async recent(@Query('scope') scope?: string): Promise<unknown[]> {
    const items = await this.feed.getRecent();
    if (scope === 'market' || scope === 'system') {
      const marketOnly = scope === 'market';
      return items.filter((e) => e.event_type.startsWith('market.') === marketOnly);
    }
    return items;
  }

  @Sse('stream')
  stream(): Observable<{ data?: unknown; retry?: number }> {
    const url = this.config.REDIS_URL;
    return new Observable((subscriber) => {
      const redis = new Redis(url);
      let closed = false;

      const forward = (raw: string) => {
        if (closed) return;
        try {
          subscriber.next({ data: JSON.parse(raw) });
        } catch {
          // skip malformed frames
        }
      };

      redis.subscribe(MARKET_CHANNEL, SYSTEM_CHANNEL, (err) => {
        if (err) {
          subscriber.error(err);
          return;
        }
        void this.feed
          .getRecent()
          .then((recent) => recent.forEach((e) => subscriber.next({ data: e })))
          .catch((e) => console.error('[events] recent replay failed', e));
      });
      redis.on('message', (_channel, raw) => forward(raw));

      const heartbeat = setInterval(() => {
        if (!closed) {
          subscriber.next({ retry: 3000, data: { event_type: '__heartbeat__', occurred_at: new Date().toISOString() } });
        }
      }, 25000);

      return () => {
        closed = true;
        clearInterval(heartbeat);
        redis.disconnect();
      };
    });
  }

  @Post('presence')
  @HttpCode(HttpStatus.OK)
  async presence(@Headers('authorization') authorization?: string): Promise<{ ok: true }> {
    if (!authorization?.startsWith('Bearer ')) return { ok: true };
    const user = await this.auth.verifyToken(authorization.slice(7));
    await this.feed.touchPresence(user);
    return { ok: true };
  }
}