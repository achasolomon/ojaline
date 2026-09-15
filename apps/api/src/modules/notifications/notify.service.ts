import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { FeedService, type NotificationType } from './feed.service.js';
import { PushService } from '../push/push.service.js';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  deep_link?: string;
}

/**
 * Single delivery seam for domain events: persists an in-app feed row
 * (and broadcasts it over SSE) AND appends a push-log row for the queued
 * sender. Both writes are best-effort and never throw into the caller.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  async notify(userId: string, input: NotifyInput): Promise<void> {
    try {
      await this.feed.push(userId, input);
    } catch (err) {
      this.logger.warn({ err, userId }, 'feed push skipped');
    }
    try {
      await this.push.sendNotification(userId, input.title, input.body ?? '', input.deep_link ? { deep_link: input.deep_link } : {});
    } catch (err) {
      this.logger.warn({ err, userId }, 'push log skipped');
    }
  }

  /** Fan out to every user holding any of the given role names. */
  async notifyRoles(roles: string[], input: NotifyInput): Promise<void> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `SELECT DISTINCT ur.user_id
       FROM pii.user_roles ur
       JOIN pii.roles r ON r.id = ur.role_id
       WHERE r.name = ANY($1)`,
      [roles],
    );
    for (const row of rows) {
      await this.notify(row.user_id, input);
    }
  }
}