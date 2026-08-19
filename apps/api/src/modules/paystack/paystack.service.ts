import { Injectable, Logger } from '@nestjs/common';
import { loadConfig } from '@ojaline/config';
import { createHmac } from 'node:crypto';

export interface InitializeInput {
  reference: string;
  amount_kobo: number;
  email: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackEvent {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    metadata?: Record<string, unknown>;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor() {
    const c = loadConfig();
    this.baseUrl = c.PAYSTACK_BASE_URL;
    this.secretKey = c.PAYSTACK_SECRET_KEY;
    this.webhookSecret = c.PAYSTACK_WEBHOOK_SECRET;
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const url = `${this.baseUrl}/transaction/initialize`;
    const body = {
      reference: input.reference,
      amount: input.amount_kobo,
      email: input.email,
      metadata: input.metadata ?? {},
    };

    this.logger.log({ reference: input.reference, amount: input.amount_kobo }, 'paystack initialize');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error({ status: res.status, body: text }, 'paystack initialize failed');
      throw new Error(`Paystack initialize failed: ${res.status}`);
    }

    const json = (await res.json()) as { status: boolean; data: { authorization_url: string; access_code: string; reference: string } };
    if (!json.status) {
      throw new Error(`Paystack initialize returned status=false`);
    }

    return {
      authorization_url: json.data.authorization_url,
      access_code: json.data.access_code,
      reference: json.data.reference,
    };
  }

  async verify(reference: string): Promise<{ status: string; amount: number }> {
    const url = `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error({ status: res.status, body: text }, 'paystack verify failed');
      throw new Error(`Paystack verify failed: ${res.status}`);
    }

    const json = (await res.json()) as { status: boolean; data: { status: string; amount: number } };
    return { status: json.data.status, amount: json.data.amount };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = createHmac('sha512', this.webhookSecret)
      .update(payload)
      .digest('hex');
    return expected === signature;
  }

  parseWebhookEvent(payload: string): PaystackEvent {
    return JSON.parse(payload) as PaystackEvent;
  }
}
