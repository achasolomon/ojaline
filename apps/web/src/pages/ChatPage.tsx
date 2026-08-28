import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sendChatMessage, getChatMessages, type ChatMessage } from '../lib/api';

const DEMO_USER_ID = '7c068a1a-fcca-4c91-a3e3-a0a96adfba12';

export default function ChatPage() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    getChatMessages(conversationId, DEMO_USER_ID).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId) return;
    setSending(true);
    try {
      const result = await sendChatMessage(conversationId, DEMO_USER_ID, input.trim());
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

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold flex-1">Chat</h1>
        <button
          type="button"
          onClick={() => alert('VoIP calling coming soon. For now, use in-app chat to coordinate delivery.')}
          className="flex items-center gap-1.5 bg-primary-light text-primary text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.37 1.61.69 2.38a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.77.32 1.57.56 2.38.69a2 2 0 0 1 1.72 2.01z"/>
          </svg>
          Call Seller
        </button>
      </header>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-[#fef3cd] border-b border-[#ffc107] px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-[#856404]">{w}</p>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-text">Start a conversation</p>
            <p className="text-xs text-textSecondary mt-1">Ask about this product, availability, or delivery</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_id === DEMO_USER_ID;
          const isSystem = msg.message_type === 'system';
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <span className="text-[11px] text-textSecondary bg-surface rounded-full px-3 py-1">{msg.content}</span>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                isOwn ? 'bg-primary text-white rounded-br-md' : 'bg-surface text-text rounded-bl-md'
              }`}>
                {!isOwn && msg.sender_name && (
                  <div className="text-[10px] font-bold opacity-70 mb-0.5">{msg.sender_name}</div>
                )}
                <p className="text-sm">{msg.content}</p>
                <div className={`text-[9px] mt-0.5 ${isOwn ? 'opacity-60' : 'text-textSecondary'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-textSecondary mt-1.5 text-center">
          🔒 Your conversation is logged for buyer protection. Phone numbers and external contact links are blocked.
        </p>
      </div>
    </div>
  );
}
