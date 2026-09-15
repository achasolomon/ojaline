import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';
import { Icon } from './icons';

export function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(() => getUnreadCount());

  useEffect(() => {
    const unsub = subscribeNotifications((list) =>
      setUnread(list.filter((n) => !n.read).length),
    );
    return unsub;
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate('/notifications')}
      className="relative rounded-lg p-2 text-textSecondary transition hover:bg-surface hover:text-text"
      aria-label="Notifications"
    >
      <Icon name="bell" size={18} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#df3535] px-1 text-[8px] font-bold text-white leading-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}