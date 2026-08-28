import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserConversations, type Conversation } from '../lib/api';

const DEMO_USER_ID = '7c068a1a-fcca-4c91-a3e3-a0a96adfba12';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function ConversationsPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getUserConversations(DEMO_USER_ID).then((convos) => {
      if (!cancelled) setConversations(convos);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Messages</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-text">No conversations yet</p>
            <p className="text-xs text-textSecondary mt-1">Start chatting with a seller from any product page</p>
          </div>
        ) : (
          <div>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left cursor-pointer bg-white hover:bg-surface transition"
              >
                <div className="w-11 h-11 rounded-full bg-primary-light flex items-center justify-center text-lg shrink-0">
                  👤
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text truncate">{conv.other_party_name}</span>
                    {conv.last_message_at && (
                      <span className="text-[11px] text-textSecondary shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>
                    )}
                  </div>
                  <p className="text-xs text-textSecondary truncate mt-0.5">
                    {conv.last_message || 'No messages yet'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
