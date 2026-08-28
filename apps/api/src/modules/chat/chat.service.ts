import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

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
  constructor(@Inject(Pool) private readonly pool: Pool) {}

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
    let blocked = false;

    if (detections.length > 0) {
      blocked = true;

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
      `SELECT c.*,
        (SELECT content FROM chat.messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM chat.messages cm WHERE cm.conversation_id = c.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT full_name FROM pii.users u WHERE u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END) AS other_party_name
       FROM chat.conversations c
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY c.updated_at DESC`,
      [userId],
    );
    return rows;
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
