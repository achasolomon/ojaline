import { validateEnvelope } from '@ojaline/contracts';
import type { EventType, EventPayload, OutboxEnvelope } from '@ojaline/contracts';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

/**
 * Fetches a raw outbox envelope (e.g. from a debug/replay endpoint) and
 * validates it against the shared contract, so the client never trusts
 * a malformed event (ADR-003/008).
 */
export async function getEnvelope<T extends EventType>(
  path: string,
  expectedType: T,
): Promise<OutboxEnvelope & { payload: EventPayload<T> }> {
  const raw = await getJson<unknown>(path);
  const result = validateEnvelope(raw);
  if (!result.ok) throw new ApiError(0, `invalid envelope: ${result.reason}`);
  if (result.envelope.event_type !== expectedType) {
    throw new ApiError(0, `expected ${expectedType}, got ${result.envelope.event_type}`);
  }
  return result.envelope as OutboxEnvelope & { payload: EventPayload<T> };
}

/** Placeholder auth surface. Sprint 1 replaces this with real OTP/phone flow. */
export async function login(phoneOrEmail: string, _password: string): Promise<{ user_id: string }> {
  return postJson('/auth/login', { phone_or_email: phoneOrEmail });
}
