import type { IconName } from '../components/icons';
import { isLoggedIn } from './session';

const NOTIF_KEY = 'kika_notifications';

export type NotificationType = 'order' | 'chat' | 'market' | 'deal' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
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

function emit() {
  listeners.forEach((l) => l(read()));
}

function read(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: AppNotification[]) {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
  emit();
}

function seed(): AppNotification[] {
  const now = Date.now();
  const mk = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  return [
    {
      id: 'seed-1',
      type: 'market',
      title: 'Cele Cele Market Day tomorrow',
      body: 'Mile 12, Lagos opens 5:30 AM — stock up on wholesale produce at market-day prices.',
      created_at: mk(26),
      read: false,
    },
    {
      id: 'seed-2',
      type: 'chat',
      title: 'New message from Adebola Akinwale',
      body: 'Your tatashe order is ready for pickup — when should we meet at the stall?',
      created_at: mk(95),
      read: false,
    },
    {
      id: 'seed-3',
      type: 'deal',
      title: 'Deal alert: Fresh tomatoes',
      body: 'Fresh tomatoes dropped to a new market-day low. Limited stock, grab it while it lasts.',
      created_at: mk(320),
      read: false,
    },
  ];
}

export function getNotifications(): AppNotification[] {
  try {
    if (!isLoggedIn()) return [];
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) {
      const seeded = seed();
      write(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

export function pushNotification(input: Omit<AppNotification, 'id' | 'created_at' | 'read'>): void {
  const item: AppNotification = {
    ...input,
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    read: false,
  };
  write([item, ...read()].slice(0, 50));
}

export function markNotificationRead(id: string): void {
  const items = read();
  const item = items.find((i) => i.id === id);
  if (item && !item.read) {
    item.read = true;
    write(items);
  }
}

export function markAllNotificationsRead(): void {
  const items = read();
  let changed = false;
  items.forEach((i) => { if (!i.read) { i.read = true; changed = true; } });
  if (changed) write(items);
}

export function clearNotifications(): void {
  write([]);
}

export function subscribeNotifications(listener: NotifListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}