import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications,
  NOTIFICATION_ICONS, subscribeNotifications,
  type AppNotification,
} from '../lib/notifications';
import { Icon } from '../components/icons';

const TYPE_LABELS: Record<AppNotification['type'], string> = {
  order: 'Orders',
  chat: 'Chat',
  market: 'Market Day',
  deal: 'Deals',
  system: 'Kika',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>(() => getNotifications());

  useEffect(() => {
    const unsub = subscribeNotifications(setItems);
    return unsub;
  }, []);

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="mx-auto max-w-[720px] flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-text">Notifications</h1>
          <p className="text-xs text-textSecondary mt-1">{unread > 0 ? `${unread} unread` : 'You\u2019re all caught up'}</p>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="text-xs font-semibold text-primary bg-primary-light rounded-lg px-3 py-2 border-none cursor-pointer hover:bg-primary/10 transition"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              className="text-xs font-semibold text-textSecondary bg-transparent border border-border rounded-lg px-3 py-2 cursor-pointer hover:text-danger hover:border-danger/40 transition"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mx-auto max-w-[720px] bg-white border border-border rounded-xl p-14 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-primary-light text-primary flex items-center justify-center">
            <Icon name="bell" size={26} />
          </div>
          <p className="text-sm font-bold text-text">No notifications</p>
          <p className="text-xs text-textSecondary mt-1 mb-4">Order updates, chat alerts and market-day reminders will show up here.</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="bg-primary text-white text-xs font-bold rounded-lg px-4 py-2.5 border-none cursor-pointer hover:bg-primary-dark transition"
          >
            Browse produce
          </button>
        </div>
      ) : (
        <div className="mx-auto max-w-[720px] bg-white border border-border rounded-xl divide-y divide-border overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => { if (!n.read) markNotificationRead(n.id); }}
              className={`w-full flex items-start gap-3.5 px-5 py-4 text-left cursor-pointer transition hover:bg-surface ${n.read ? 'bg-white' : 'bg-primary-light/40'}`}
            >
              <span className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-white border border-border text-primary">
                <Icon name={NOTIFICATION_ICONS[n.type]} size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wide ${n.read ? 'text-textSecondary' : 'text-primary'}`}>
                    {TYPE_LABELS[n.type]}
                  </span>
                  <span className="text-[10px] text-textSecondary shrink-0">{timeAgo(n.created_at)}</span>
                </span>
                <span className={`block text-sm mt-0.5 ${n.read ? 'font-medium text-text' : 'font-bold text-text'}`}>{n.title}</span>
                <span className="block text-xs text-textSecondary mt-1 leading-relaxed">{n.body}</span>
              </span>
              {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}