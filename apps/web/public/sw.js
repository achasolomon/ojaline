/* Kika web push service worker */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* ignore malformed payload */
  }
  const title = payload.title || 'Kika';
  const options = {
    body: payload.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      url: payload.deep_link || '/notifications',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) {
              client.navigate(url).catch(() => {});
            }
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});