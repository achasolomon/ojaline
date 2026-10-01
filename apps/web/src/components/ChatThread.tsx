import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { sendChatMessage, getChatMessages, getUserConversations, type ChatMessage, type Conversation } from '../lib/api';
import { activeBuyerId } from '../lib/session';
import { Icon } from './icons';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((p) => p[0]).join('').toUpperCase() : '?';
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const t = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(t) - startOfDay(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatThread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [partyName, setPartyName] = useState<string>('');
  const [input, setInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userId = activeBuyerId();

  useEffect(() => {
    if (!conversationId || !userId) return;
    let cancelled = false;
    getChatMessages(conversationId, userId).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      const other = msgs.find((m) => m.sender_id !== userId && m.sender_name);
      setPartyName((prev) => prev || other?.sender_name || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, userId]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    let cancelled = false;
    getUserConversations(userId)
      .then((convos) => {
        if (cancelled) return;
        const c = convos.find((x) => x.id === conversationId);
        if (c) {
          setConversation(c);
          setPartyName((prev) => prev || c.other_party_name || '');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const iAmSeller = conversation ? conversation.seller_id === userId : null;
  const callLabel = iAmSeller == null ? 'Call' : iAmSeller ? 'Call Buyer' : 'Call Seller';
  const roleLine = iAmSeller == null ? 'Ojaline inbox' : iAmSeller ? 'Buyer · Ojaline' : 'Seller · Ojaline';

  const promptCall = () => {
    window.alert('Voice calling is coming soon. For now, use in-app chat to coordinate delivery.');
  };

  const handleSend = async () => {
    if (!input.trim() || !conversationId || !userId) return;
    setSending(true);
    try {
      const result = await sendChatMessage(conversationId, userId, input.trim());
      if (result.blocked) {
        setWarnings(result.warnings);
        setTimeout(() => setWarnings([]), 5000);
      } else {
        setMessages((prev) => [...prev, result.message]);
      }
      setInput('');
    } catch { /* skip */ }
    setSending(false);
  };

  const items: ReactNode[] = [];
  let prevDay = '';
  let prevSender = '';

  for (const msg of messages) {
    if (msg.message_type === 'system') {
      items.push(
        <div key={msg.id} className="my-2.5 flex justify-center">
          <span className="bg-surface px-3 py-1 text-[10px] font-medium text-textSecondary">{msg.content}</span>
        </div>,
      );
      continue;
    }

    const day = new Date(msg.created_at).toDateString();
    if (day !== prevDay) {
      prevDay = day;
      items.push(
        <div key={`day-${msg.id}`} className="mb-2 flex justify-center">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-500">{dayLabel(msg.created_at)}</span>
        </div>,
      );
    }

    const isOwn = msg.sender_id === userId;
    const showName = !isOwn && msg.sender_name && msg.sender_name !== prevSender;
    prevSender = isOwn ? prevSender : (msg.sender_name ?? prevSender);
    items.push(
      <div key={msg.id} className={`mb-2 flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
          isOwn
            ? 'rounded-br-md bg-primary text-white'
            : 'rounded-bl-md border border-border bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
        }`}>
          {showName && (
            <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary-dark">{msg.sender_name}</div>
          )}
          <p className="text-sm leading-snug">{msg.content}</p>
          <div className={`mt-1 text-right text-[9px] ${isOwn ? 'text-white/60' : 'text-textSecondary'}`}>{fmtTime(msg.created_at)}</div>
        </div>
      </div>,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50/60">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-3.5 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-none bg-gray-50 text-textSecondary cursor-pointer transition hover:bg-gray-100"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        )}
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-[13px] font-extrabold text-white">
          {initials(partyName)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-extrabold tracking-tight text-text">{partyName || 'Ojaline'}</h1>
          <p className="truncate text-[10px] font-medium text-textSecondary">{roleLine}</p>
        </div>
        <button
          type="button"
          onClick={promptCall}
          className="flex shrink-0 items-center gap-1.5 rounded-full border-none bg-primary-light px-3 py-1.5 text-[11px] font-extrabold text-primary-dark cursor-pointer transition hover:bg-primary/15"
        >
          <Icon name="phone" size={12} />
          {callLabel}
        </button>
      </header>

      {warnings.length > 0 && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-700">{w}</p>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-sm">
              <Icon name="message" size={26} />
            </span>
            <p className="text-sm font-bold text-text">Start the conversation</p>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-textSecondary">
              Ask about availability, delivery or bulk pricing — replies land here instantly.
            </p>
          </div>
        ) : (
          items
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-white px-3.5 py-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-gray-50/80 py-1.5 pl-4 pr-1.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            className="flex-1 border-none bg-transparent text-sm text-text outline-none placeholder:text-textSecondary/70"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-none bg-primary text-white cursor-pointer transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="send" size={15} />
          </button>
        </div>
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[9px] text-textSecondary">
          <Icon name="shield" size={11} /> Your conversation is logged for buyer protection. Phone numbers and external contact links are blocked.
        </p>
      </div>
    </div>
  );
}