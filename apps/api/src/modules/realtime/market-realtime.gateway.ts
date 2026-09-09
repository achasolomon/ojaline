import { Injectable } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { MARKET_CHANNEL, SYSTEM_CHANNEL } from './market-feed.service.js';

const HEARTBEAT_MS = 25000;

/**
 * Raw-socket market feed (`ws(s)://host/ws/market`). Publishes the same
 * envelopes as the SSE stream for native + server-side consumers.
 */
@WebSocketGateway({ path: '/ws/market' })
@Injectable()
export class MarketRealtimeGateway {
  private readonly config = loadConfig();

  handleConnection(client: WebSocket): void {
    const redis = new Redis(this.config.REDIS_URL);
    let closed = false;

    const send = (payload: string) => {
      if (!closed && client.readyState === client.OPEN) {
        client.send(payload);
      }
    };

    redis.on('message', (_channel, raw) => send(raw));
    redis.subscribe(MARKET_CHANNEL, SYSTEM_CHANNEL, (err) => {
      if (err) {
        client.close();
        return;
      }
      send(JSON.stringify({ type: 'hello', channels: [MARKET_CHANNEL, SYSTEM_CHANNEL] }));
    });

    const heartbeat = setInterval(() => {
      if (client.readyState === client.OPEN) client.ping();
    }, HEARTBEAT_MS);

    client.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      redis.disconnect();
    });
    client.on('error', () => {
      closed = true;
      clearInterval(heartbeat);
      redis.disconnect();
    });
  }
}