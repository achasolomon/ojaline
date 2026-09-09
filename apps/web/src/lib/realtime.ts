import { getToken } from './session';

export interface MarketEnvelope {
  event_type: string;
  schema_version: number;
  aggregate_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

type EnvelopeHandler = (env: MarketEnvelope) => void;

const MAX_BACKOFF_MS = 15000;
const STREAM_PATH = '/api/events/stream';

/**
 * A single shared SSE connection fans every incoming envelope out to an
 * arbitrary number of subscribers (market feed, negotiation store,
 * notification store). The socket lives as long as at least one handler is
 * attached and shuts down when the last one leaves.
 */
const handlers = new Set<EnvelopeHandler>();

let source: EventSource | null = null;
let backoff = 1000;
let closing = false;

function open(): void {
  if (source || handlers.size === 0) return;
  const token = getToken();
  const url = `${STREAM_PATH}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
  const es = new EventSource(url);
  source = es;

  es.onopen = () => {
    backoff = 1000;
  };

  es.onmessage = (event) => {
    try {
      const env = JSON.parse(event.data) as MarketEnvelope;
      if (!env || env.event_type !== '__heartbeat__') {
        handlers.forEach((h) => h(env));
      }
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    es.close();
    source = null;
    if (closing) return;
    setTimeout(open, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };
}

function close(): void {
  closing = true;
  source?.close();
  source = null;
  closing = false;
}

/** Attach an envelope handler; opens the shared SSE connection on first use. */
export function connectMarketFeed(onEnvelope: EnvelopeHandler): void {
  handlers.add(onEnvelope);
  if (handlers.size === 1) {
    backoff = 1000;
    open();
  }
}

/** Detach a handler; shuts the socket down when nobody is left. */
export function disconnectMarketFeed(onEnvelope?: EnvelopeHandler): void {
  if (onEnvelope) handlers.delete(onEnvelope);
  else handlers.clear();
  if (handlers.size === 0) close();
}

export async function sendPresenceHeartbeat(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await fetch('/api/events/presence', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // presence is best-effort
  }
}