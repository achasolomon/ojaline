import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, clearNotifications,
  NOTIFICATION_ICONS, subscribeNotifications,
  type AppNotification,
} from '../lib/notifications';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';
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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const [items, setItems] = useState<AppNotification[]>(() => getNotifications());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeNotifications(setItems);
    return unsub;
  }, []);

  const unread = items.filter((n) => !n.read).length;
  const selected = items.find((n) => n.id === selectedId) ?? items[0] ?? null;

  const openNotif = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id);
    if (isDesktop) setSelectedId(n.id);
    else if (n.deep_link) navigate(n.deep_link);
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary-light text-primary">
        <Icon name="bell" size={26} />
      </div>
      <p className="text-sm font-bold text-text">No notifications</p>
      <p className="mt-1 text-xs text-textSecondary">
        Order updates, chat alerts and market-day reminders will show up here.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
      >
        Browse produce
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-white lg:mx-auto lg:w-full lg:max-w-[1200px] lg:px-6 lg:py-6">
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch lg:gap-5">
        {/* Left pane: notification list */}
        <div className="flex min-h-0 flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-white">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-text">Notifications</h1>
              <p className="text-[11px] font-medium text-textSecondary">
                {unread > 0 ? `${unread} unread` : 'You\u2019re all caught up'}
              </p>
            </div>
            {items.length > 0 && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="rounded-lg bg-primary-light px-3 py-2 text-[11px] font-semibold text-primary transition hover:bg-primary/10 cursor-pointer border-none"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-[11px] font-semibold text-textSecondary transition hover:text-danger hover:border-danger/40 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              emptyState
            ) : (
              <div>
                {items.map((n) => {
                  const isActive = isDesktop && selected?.id === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openNotif(n)}
                      className={`flex w-full items-start gap-3.5 border-b border-border px-5 py-4 text-left transition ${
                        isActive ? 'bg-primary-light/30' : n.read ? 'bg-white' : 'bg-primary-light/40'
                      } hover:bg-surface`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-white text-primary">
                        <Icon name={NOTIFICATION_ICONS[n.type]} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-extrabold uppercase tracking-wide ${n.read ? 'text-textSecondary' : 'text-primary'}`}>
                            {TYPE_LABELS[n.type]}
                          </span>
                          <span className="shrink-0 text-[10px] text-textSecondary">{timeAgo(n.created_at)}</span>
                        </span>
                        <span className="mt-0.5 block text-sm font-bold text-text">{n.title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-textSecondary">{n.body}</span>
                      </span>
                      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane (desktop): notification detail */}
        <div className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white lg:flex">
          {selected ? (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                  <Icon name={NOTIFICATION_ICONS[selected.type]} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-extrabold uppercase tracking-wide ${selected.read ? 'text-textSecondary' : 'text-primary'}`}>
                    {TYPE_LABELS[selected.type]}
                  </p>
                  <p className="text-[11px] font-medium text-textSecondary">{fmtDate(selected.created_at)}</p>
                </div>
                {!selected.read && (
                  <span className="shrink-0 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
                    New
                  </span>
                )}
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <h2 className="text-lg font-black leading-snug text-text">{selected.title}</h2>
                {selected.body && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-textSecondary">
                    {selected.body}
                  </p>
                )}
              </div>

              <footer className="shrink-0 border-t border-border bg-surface/30 px-5 py-3">
                {selected.deep_link ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selected.read) markNotificationRead(selected.id);
                      navigate(selected.deep_link!);
                    }}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[12px] font-bold text-white transition hover:bg-primary-dark"
                  >
                    Open it <Icon name="arrowRight" size={13} />
                  </button>
                ) : (
                  <p className="text-center text-[11px] font-semibold text-textSecondary">
                    No extra step needed — this one na just info.
                  </p>
                )}
              </footer>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
                <Icon name="bell" size={24} />
              </span>
              <p className="mt-3 text-sm font-bold text-text">No notification wey dey</p>
              <p className="mt-1 text-[11px] text-textSecondary">
                Tap any notice on the left to read the full detail here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}