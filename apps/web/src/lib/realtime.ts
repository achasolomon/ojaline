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

let source: EventSource | null = null;
let stopped = false;
let backoff = 1000;
let handler: EnvelopeHandler | null = null;

function open(): void {
  if (stopped) return;
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
      if (env && env.event_type && env.event_type !== '__heartbeat__') {
        handler?.(env);
      }
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    es.close();
    source = null;
    if (stopped) return;
    setTimeout(open, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };
}

export function connectMarketFeed(onEnvelope: EnvelopeHandler): void {
  handler = onEnvelope;
  stopped = false;
  open();
}

export function disconnectMarketFeed(): void {
  stopped = true;
  source?.close();
  source = null;
  handler = null;
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