import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AddressesService {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async getAddresses(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT id, label, address_line1, address_line2, city, state, lga, landmark, is_default, created_at
       FROM users.saved_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return rows;
  }

  async createAddress(userId: string, input: {
    label?: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    lga?: string;
    landmark?: string;
    phone_number: string;
    is_default?: boolean;
  }): Promise<Record<string, unknown>> {
    if (input.is_default) {
      await this.pool.query(
        `UPDATE users.saved_addresses SET is_default = false WHERE user_id = $1`,
        [userId],
      );
    }

    const { rows } = await this.pool.query(
      `INSERT INTO users.saved_addresses (user_id, label, address_line1, address_line2, city, state, lga, landmark, phone_number, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, label, address_line1, address_line2, city, state, lga, landmark, is_default, created_at`,
      [userId, input.label || 'Home', input.address_line1, input.address_line2 || null, input.city, input.state, input.lga || null, input.landmark || null, input.phone_number, input.is_default || false],
    );
    return rows[0];
  }

  async setDefault(userId: string, addressId: string): Promise<void> {
    const check = await this.pool.query(
      `SELECT id FROM users.saved_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (check.rowCount === 0) throw new NotFoundException('Address not found');

    await this.pool.query(
      `UPDATE users.saved_addresses SET is_default = false WHERE user_id = $1`,
      [userId],
    );
    await this.pool.query(
      `UPDATE users.saved_addresses SET is_default = true WHERE id = $1`,
      [addressId],
    );
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const check = await this.pool.query(
      `SELECT id, is_default FROM users.saved_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (check.rowCount === 0) throw new NotFoundException('Address not found');
    if (check.rows[0].is_default) throw new BadRequestException('Cannot delete default address');

    await this.pool.query(
      `DELETE FROM users.saved_addresses WHERE id = $1`,
      [addressId],
    );
  }
}
