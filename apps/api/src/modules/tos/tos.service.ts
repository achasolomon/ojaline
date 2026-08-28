import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ToSEnforcementService {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async recordViolation(userId: string, type: string, severity: number, description: string, evidence: Record<string, unknown> = {}): Promise<{ action: string; warning_count: number }> {
    await this.pool.query(
      `INSERT INTO trust.tos_violations (user_id, violation_type, severity, description, evidence)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, severity, description, JSON.stringify(evidence)],
    );

    const { rows } = await this.pool.query(
      `SELECT COUNT(*) AS cnt FROM trust.tos_violations WHERE user_id = $1`,
      [userId],
    );
    const warningCount = parseInt(rows[0].cnt, 10);

    let action = 'flagged';
    if (warningCount >= 5) {
      action = 'suspended';
    } else if (warningCount >= 3) {
      action = 'visibility_reduced';
    }

    if (action === 'visibility_reduced' || action === 'suspended') {
      await this.pool.query(
        `UPDATE catalog.seller_profiles
         SET visibility_penalty = true, tos_warning_count = $1
         WHERE user_id = $2`,
        [warningCount, userId],
      );
    } else {
      await this.pool.query(
        `UPDATE catalog.seller_profiles
         SET tos_warning_count = $1
         WHERE user_id = $2`,
        [warningCount, userId],
      );
    }

    return { action, warning_count: warningCount };
  }

  async getViolations(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT id, violation_type, severity, description, action_taken, created_at
       FROM trust.tos_violations
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async getSellerStatus(userId: string): Promise<{ warning_count: number; visibility_penalty: boolean; latest_action: string | null }> {
    const { rows: violations } = await this.pool.query(
      `SELECT action_taken, created_at FROM trust.tos_violations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const { rows: profile } = await this.pool.query(
      `SELECT tos_warning_count, visibility_penalty FROM catalog.seller_profiles WHERE user_id = $1`,
      [userId],
    );
    return {
      warning_count: profile[0]?.tos_warning_count ?? 0,
      visibility_penalty: profile[0]?.visibility_penalty ?? false,
      latest_action: violations[0]?.action_taken ?? null,
    };
  }
}
