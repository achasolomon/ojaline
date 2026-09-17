import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserConversations, type Conversation } from '../lib/api';
import { activeBuyerId } from '../lib/session';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';
import { ChatThread } from '../components/ChatThread';
import { Icon } from '../components/icons';

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

export default function ConversationsPage({ base = '/chat' }: { base?: string }) {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const userId = activeBuyerId();
    if (!userId) return undefined;
    let cancelled = false;
    getUserConversations(userId).then((convos) => {
      if (!cancelled) setConversations(convos);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;

  const openConvo = (conv: Conversation) => {
    if (isDesktop) setSelectedId(conv.id);
    else navigate(`${base}/${conv.id}`);
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary-light text-primary">
        <Icon name="message" size={24} />
      </div>
      <p className="text-sm font-medium text-text">No conversations yet</p>
      <p className="mt-1 text-xs text-textSecondary">Start chatting with a seller from any product page</p>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-white lg:mx-auto lg:w-full lg:max-w-[1200px] lg:px-6 lg:py-6">
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch lg:gap-5">
        {/* Left pane: conversations list */}
        <div className="flex min-h-0 flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-white">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <button type="button" onClick={() => navigate(-1)} className="p-1 lg:hidden">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="flex-1 text-lg font-semibold text-text">Messages</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
              <Icon name="message" size={12} />
              {conversations.length} chat{conversations.length === 1 ? '' : 's'}
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-surface" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              emptyState
            ) : (
              <div>
                {conversations.map((conv) => {
                  const isActive = isDesktop && selected?.id === conv.id;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => openConvo(conv)}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left cursor-pointer transition ${
                        isActive ? 'bg-primary-light/30' : 'bg-white hover:bg-surface'
                      }`}
                    >
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                        <Icon name="user" size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-semibold text-text">{conv.other_party_name}</span>
                          {conv.last_message_at && (
                            <span className="ml-2 shrink-0 text-[11px] text-textSecondary">{timeAgo(conv.last_message_at)}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-textSecondary">
                          {conv.last_message || 'No messages yet'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane (desktop): chat thread */}
        <div className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white lg:flex">
          {selected ? (
            <ChatThread conversationId={selected.id} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
                <Icon name="message" size={24} />
              </span>
              <p className="mt-3 text-sm font-bold text-text">No chat wey dey</p>
              <p className="mt-1 text-[11px] text-textSecondary">
                Tap any conversation here to keep the discussion going.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}