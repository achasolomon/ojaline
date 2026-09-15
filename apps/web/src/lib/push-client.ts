import {
  getVapidPublicKey,
  getPushSubscriptions,
  subscribeToPush,
  unsubscribeFromPush,
} from './api';
import { getUser } from './session';

export type PushPermissionStatus = 'granted' | 'denied' | 'default';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermission(): PushPermissionStatus | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionStatus;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

/** Opt the current user in to browser push and record the subscription server-side. */
export async function enableBrowserPush(): Promise<void> {
  const user = getUser();
  if (!user) throw new Error('Log in to receive push notifications');
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('This browser does not support push notifications');

  const key = await getVapidPublicKey();
  if (!key.public_key || !key.enabled) {
    throw new Error('Push notifications are not configured on this server yet');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const existing = await reg.pushManager.getSubscription();
  const subscription = existing ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key.public_key) as unknown as BufferSource,
  }));

  await subscribeToPush(user.id, {
    endpoint: subscription.endpoint,
    p256dh: bytesToBase64(new Uint8Array(subscription.getKey('p256dh')!)),
    auth: bytesToBase64(new Uint8Array(subscription.getKey('auth')!)),
  });
}

/** Remove the browser subscription and every server-side record for the user. */
export async function disableBrowserPush(): Promise<void> {
  const user = getUser();
  if (!user) return;

  const userId = user.id;
  const subs = await getPushSubscriptions(userId);
  for (const sub of subs) {
    try {
      await unsubscribeFromPush(userId, sub.endpoint);
    } catch {
      /* best-effort */
    }
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    /* best-effort */
  }
}

/** True when the current user has at least one server-side push subscription. */
export async function hasServerPushSubscription(): Promise<boolean> {
  const user = getUser();
  if (!user || !isPushSupported()) return false;
  try {
    const subs = await getPushSubscriptions(user.id);
    return subs.length > 0;
  } catch {
    return false;
  }
}
