import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import { NotifyService } from '../notifications/notify.service.js';

const CIRCUMVENTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'phone_ng', regex: /(?:\+?234|0)[789][01]\d{7,8}/g },
  { name: 'phone_general', regex: /\b\d{10,11}\b/g },
  { name: 'whatsapp', regex: /(?:wa\.me|whatsapp\.com|api\.whatsapp)/gi },
  { name: 'telegram', regex: /(?:t\.me|telegram\.me)/gi },
  { name: 'call_me', regex: /\bcall\s+me\s+(?:on|at)\b/gi },
  { name: 'add_me', regex: /\badd\s+me\s+(?:on|at)\b/gi },
  { name: 'my_number', regex: /\bmy\s+(?:phone|number|line)\s+(?:is|na)\b/gi },
  { name: 'contact_me', regex: /\bcontact\s+me\s+(?:on|at|via)\b/gi },
];

function detectCircumvention(content: string): Array<{ name: string; match: string }> {
  const results: Array<{ name: string; match: string }> = [];
  for (const pattern of CIRCUMVENTION_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      for (const m of matches) {
        results.push({ name: pattern.name, match: m });
      }
    }
  }
  return results;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(NotifyService) private readonly notify: NotifyService,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
  ) {}

  async getOrCreateConversation(input: {
    buyer_id: string;
    seller_id: string;
    offer_id?: string;
    order_id?: string;
  }): Promise<Record<string, unknown>> {
    const existing = await this.pool.query(
      `SELECT * FROM chat.conversations
       WHERE buyer_id = $1 AND seller_id = $2
         AND (offer_id = $3 OR $3::uuid IS NULL)
       ORDER BY updated_at DESC LIMIT 1`,
      [input.buyer_id, input.seller_id, input.offer_id || null],
    );

    if (existing.rows.length > 0) return existing.rows[0];

    const { rows } = await this.pool.query(
      `INSERT INTO chat.conversations (buyer_id, seller_id, offer_id, order_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.buyer_id, input.seller_id, input.offer_id || null, input.order_id || null],
    );
    return rows[0];
  }

  async sendMessage(conversationId: string, senderId: string, content: string): Promise<{
    message: Record<string, unknown>;
    warnings: string[];
    blocked: boolean;
  }> {
    const conv = await this.pool.query(
      `SELECT * FROM chat.conversations WHERE id = $1`,
      [conversationId],
    );
    if (conv.rows.length === 0) throw new NotFoundException('Conversation not found');

    const conversation = conv.rows[0];
    if (conversation.buyer_id !== senderId && conversation.seller_id !== senderId) {
      throw new BadRequestException('You are not part of this conversation');
    }
    if (conversation.status === 'blocked') {
      throw new BadRequestException('This conversation has been blocked');
    }

    const detections = detectCircumvention(content);
    const warnings: string[] = [];

    if (detections.length > 0) {

      const uniquePatterns = [...new Set(detections.map(d => d.name))];
      for (const patternName of uniquePatterns) {
        await this.pool.query(
          `INSERT INTO chat.circumvention_log (user_id, message_id, pattern_matched, content_preview, action_taken)
           VALUES ($1, NULL, $2, $3, 'blocked')`,
          [senderId, patternName, content.substring(0, 100)],
        );
      }

      const violationCount = await this.pool.query(
        `SELECT COUNT(*)::int AS cnt FROM chat.circumvention_log WHERE user_id = $1`,
        [senderId],
      );

      if (violationCount.rows[0].cnt >= 5) {
        warnings.push('Repeated violations may lead to account restrictions. Please keep all communication on the platform.');
      } else {
        warnings.push('Message blocked: sharing phone numbers or external contact details is not allowed on Ojaline. Your conversation is logged for buyer protection.');
      }

      const { rows: systemMsg } = await this.pool.query(
        `INSERT INTO chat.messages (conversation_id, sender_id, content, message_type, flagged, flag_reason)
         VALUES ($1, $2, $3, 'system', true, $4)
         RETURNING id, conversation_id, sender_id, content, message_type, flagged, created_at`,
        [conversationId, senderId, '⚠️ This message was blocked for containing contact information.', detections.map(d => d.name).join(',')],
      );

      return { message: systemMsg[0], warnings, blocked: true };
    }

    const { rows } = await this.pool.query(
      `INSERT INTO chat.messages (conversation_id, sender_id, content, message_type)
       VALUES ($1, $2, $3, 'text')
       RETURNING id, conversation_id, sender_id, content, message_type, flagged, created_at`,
      [conversationId, senderId, content],
    );

    await this.pool.query(
      `UPDATE chat.conversations SET updated_at = now() WHERE id = $1`,
      [conversationId],
    );

    const recipientId = conversation.buyer_id === senderId ? conversation.seller_id : conversation.buyer_id;
    void this.publishMessage(rows[0], recipientId);

    return { message: rows[0], warnings: [], blocked: false };
  }

  async getMessages(conversationId: string, userId: string, limit = 50, offset = 0): Promise<Array<Record<string, unknown>>> {
    const conv = await this.pool.query(
      `SELECT * FROM chat.conversations WHERE id = $1`,
      [conversationId],
    );
    if (conv.rows.length === 0) throw new NotFoundException('Conversation not found');
    if (conv.rows[0].buyer_id !== userId && conv.rows[0].seller_id !== userId) {
      throw new BadRequestException('You are not part of this conversation');
    }

    const { rows } = await this.pool.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM chat.messages m
       JOIN pii.users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset],
    );
    return rows;
  }

  async getUserConversations(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT c.id, c.buyer_id, c.seller_id, c.offer_id, c.order_id, c.status, c.created_at, c.updated_at,
        c.buyer_last_read_at, c.seller_last_read_at,
        (SELECT content FROM chat.messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM chat.messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT sender_id FROM chat.messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message_sender_id,
        (SELECT full_name FROM pii.users u WHERE u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END) AS other_party_name,
        (SELECT id FROM pii.users u WHERE u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END) AS other_party_id
       FROM chat.conversations c
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY c.updated_at DESC`,
      [userId],
    );
    return rows.map((r) => {
      const isBuyer = String(r.buyer_id) === userId;
      const readAt = isBuyer ? r.buyer_last_read_at : r.seller_last_read_at;
      const lastMessageSenderId = r.last_message_sender_id ? String(r.last_message_sender_id) : null;
      const unread = lastMessageSenderId && lastMessageSenderId !== userId
        ? (readAt == null || (r.last_message_at && new Date(String(r.last_message_at)) > new Date(String(readAt))))
        : false;
      return {
        id: String(r.id),
        buyer_id: String(r.buyer_id),
        seller_id: String(r.seller_id),
        offer_id: r.offer_id ? String(r.offer_id) : null,
        order_id: r.order_id ? String(r.order_id) : null,
        status: String(r.status),
        last_message: r.last_message ? String(r.last_message) : null,
        last_message_at: r.last_message_at,
        other_party_name: r.other_party_name ? String(r.other_party_name) : null,
        other_party_id: r.other_party_id ? String(r.other_party_id) : null,
        unread: Boolean(unread),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  }

  async markConversationRead(conversationId: string, userId: string): Promise<{ ok: boolean }> {
    const conv = await this.pool.query(`SELECT buyer_id, seller_id FROM chat.conversations WHERE id = $1`, [conversationId]);
    if (conv.rows.length === 0) throw new NotFoundException('Conversation not found');
    const row = conv.rows[0];
    if (row.buyer_id !== userId && row.seller_id !== userId) throw new BadRequestException('You are not part of this conversation');
    const col = row.buyer_id === userId ? 'buyer_last_read_at' : 'seller_last_read_at';
    await this.pool.query(`UPDATE chat.conversations SET ${col} = now() WHERE id = $1`, [conversationId]);
    return { ok: true };
  }

  private async publishMessage(msg: Record<string, unknown>, recipientId: string): Promise<void> {
    const senderName = await this.pool.query(`SELECT full_name FROM pii.users WHERE id = $1`, [String(msg.sender_id)]).then((r) => r.rows[0]?.full_name ?? 'Buyer');
    const conversationId = String(msg.conversation_id);
    void this.feed.publishMarket('chat.message', String(msg.id), {
      conversation_id: conversationId,
      message_id: String(msg.id),
      sender_id: String(msg.sender_id),
      sender_name: String(senderName),
      content: String(msg.content),
      created_at: String(msg.created_at),
    });
    try {
      await this.notify.notify(recipientId, {
        type: 'chat',
        title: String(senderName),
        body: String(msg.content).slice(0, 120),
        deep_link: `/chat/${conversationId}`,
      });
    } catch {
      /* best-effort */
    }
  }

  async createProxyNumber(conversationId: string): Promise<string> {
    const digits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const proxyNumber = `+234${digits.substring(0, 10)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO chat.proxy_numbers (conversation_id, proxy_number, expires_at)
       VALUES ($1, $2, $3)`,
      [conversationId, proxyNumber, expiresAt.toISOString()],
    );

    return proxyNumber;
  }
}
