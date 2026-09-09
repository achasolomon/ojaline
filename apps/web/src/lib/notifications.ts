import type { IconName } from '../components/icons';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationsRead,
} from './api';
import { connectMarketFeed, disconnectMarketFeed, type MarketEnvelope } from './realtime';
import { activeBuyerId } from './session';

const CLEARED_KEY = 'kika_notif_cleared';

export type NotificationType = 'order' | 'chat' | 'market' | 'deal' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  deep_link?: string | null;
  created_at: string;
  read: boolean;
}

export const NOTIFICATION_ICONS: Record<NotificationType, IconName> = {
  order: 'box',
  chat: 'message',
  market: 'calendar',
  deal: 'tag',
  system: 'bell',
};

type NotifListener = (items: AppNotification[]) => void;

const listeners = new Set<NotifListener>();

let items: AppNotification[] = [];
let unread = 0;
let loaded = false;
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let feedConnected = false;

const POLL_MS = 30000;

function clearedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function visible(): AppNotification[] {
  const cleared = clearedIds();
  return items.filter((n) => !cleared.has(n.id));
}

function emit() {
  const list = visible();
  listeners.forEach((l) => l(list));
}

async function refresh(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [list, count] = await Promise.all([
        fetchNotifications(activeBuyerId(), 50),
        fetchUnreadCount(activeBuyerId()),
      ]);
      items = list.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        deep_link: n.deep_link,
        created_at: n.created_at,
        read: n.read,
      }));
      unread = count;
    } catch {
      /* offline — keep the last known list */
    } finally {
      loaded = true;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

function ensureLoaded(): Promise<void> {
  return refresh();
}

function startPoll(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => void refresh(), POLL_MS);
}

function stopPollIfIdle(): void {
  if (listeners.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onEnvelope(env: MarketEnvelope): void {
  if (env.event_type !== 'notification.feed') return;
  const userId = (env.payload as { user_id?: string }).user_id;
  if (userId && userId === activeBuyerId()) void refresh();
}

function startFeed(): void {
  if (feedConnected) return;
  feedConnected = true;
  connectMarketFeed(onEnvelope);
}

function stopFeedIfIdle(): void {
  if (listeners.size === 0 && feedConnected) {
    feedConnected = false;
    disconnectMarketFeed(onEnvelope);
  }
}

export function subscribeNotifications(listener: NotifListener): () => void {
  listeners.add(listener);
  void ensureLoaded();
  startPoll();
  startFeed();
  return () => {
    listeners.delete(listener);
    stopPollIfIdle();
    stopFeedIfIdle();
  };
}

export function getNotifications(): AppNotification[] {
  if (!loaded) void ensureLoaded();
  return visible();
}

export function getUnreadCount(): number {
  if (!loaded) void ensureLoaded();
  return unread;
}

/**
 * Local-only push (no public write endpoint yet): used by checkout/order
 * flows to surface an in-app notice immediately. Server-published events
 * still take over via the SSE refresh.
 */
export function pushNotification(input: Omit<AppNotification, 'id' | 'created_at' | 'read'>): void {
  const item: AppNotification = {
    ...input,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    read: false,
  };
  items = [item, ...items].slice(0, 100);
  unread += 1;
  emit();
}

export function markNotificationRead(id: string): void {
  const n = items.find((i) => i.id === id);
  if (!n || n.read) return;
  n.read = true;
  unread = Math.max(0, unread - 1);
  emit();
  void markNotificationsRead(activeBuyerId(), [id]).catch(() => {});
}

export function markAllNotificationsRead(): void {
  if (!visible().some((n) => !n.read)) return;
  items = items.map((n) => ({ ...n, read: true }));
  unread = 0;
  emit();
  void markNotificationsRead(activeBuyerId()).catch(() => {});
}

export function clearNotifications(): void {
  const ids = items.map((n) => n.id);
  if (ids.length === 0) return;
  try {
    const merged = [...new Set([...clearedIds(), ...ids])];
    localStorage.setItem(CLEARED_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota errors */
  }
  emit();
}

/** Map an API notification row to the app shape (currently identical). */
export function forTesting(clear = false): void {
  if (clear) {
    items = [];
    unread = 0;
    loaded = false;
  }
}