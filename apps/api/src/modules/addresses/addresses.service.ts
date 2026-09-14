import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { NIGERIA, normalizeState, wardsFor, type Ward } from './areas.data.js';

export interface CreateAddressInput {
  label?: string;
  recipient_name?: string;
  address_line1: string;
  address_line2?: string;
  city?: string;
  state: string;
  area?: string;
  lga?: string;
  ward?: string;
  landmark?: string;
  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  phone_number: string;
  is_default?: boolean;
}

const ADDRESS_COLS = `
  id, label, recipient_name, address_line1, address_line2, city, state, area, lga, ward,
  landmark, instructions, latitude, longitude, phone_number, is_default, created_at
`;

@Injectable()
export class AddressesService {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  getCoveredCities() {
    return NIGERIA;
  }

  getWards(state: string, lga: string): Ward[] {
    if (!state?.trim() || !lga?.trim()) throw new BadRequestException('state and lga are required');
    return wardsFor(state, lga);
  }

  async getAddresses(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT ${ADDRESS_COLS}
         FROM users.saved_addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return rows;
  }

  async createAddress(userId: string, input: CreateAddressInput): Promise<Record<string, unknown>> {
    if (!input.address_line1?.trim()) throw new BadRequestException('Street address is required');
    if (!input.state?.trim()) throw new BadRequestException('State is required');
    // Nationwide: any real Nigerian state is served; area/LGA is descriptive.
    const stateName = normalizeState(input.state);
    if (!stateName) {
      throw new BadRequestException('Pick a state from the list — we deliver across all 36 states and the FCT.');
    }
    const state = NIGERIA.find((s) => s.state === stateName)!;
    // The DB requires a city; default to the state capital when not pin-pointed.
    const city = input.city?.trim() || state.capital;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.is_default) {
        await client.query(`UPDATE users.saved_addresses SET is_default = false WHERE user_id = $1`, [userId]);
      }

      const { rows } = await client.query(
        `INSERT INTO users.saved_addresses
           (user_id, label, recipient_name, address_line1, address_line2, city, state, area, lga, ward, landmark, instructions, latitude, longitude, phone_number, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING ${ADDRESS_COLS}`,
        [
          userId,
          input.label || 'Home',
          input.recipient_name || null,
          input.address_line1.trim(),
          input.address_line2 || null,
          city,
          stateName,
          input.area || null,
          input.lga || null,
          input.ward || null,
          input.landmark || null,
          input.instructions || null,
          input.latitude == null ? null : Number(input.latitude),
          input.longitude == null ? null : Number(input.longitude),
          input.phone_number || '08000000000',
          input.is_default || false,
        ],
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async setDefault(userId: string, addressId: string): Promise<void> {
    const check = await this.pool.query(
      `SELECT id FROM users.saved_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (check.rowCount === 0) throw new NotFoundException('Address not found');

    await this.pool.query(`UPDATE users.saved_addresses SET is_default = false WHERE user_id = $1`, [userId]);
    await this.pool.query(`UPDATE users.saved_addresses SET is_default = true WHERE id = $1`, [addressId]);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const check = await this.pool.query(
      `SELECT id, is_default FROM users.saved_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (check.rowCount === 0) throw new NotFoundException('Address not found');
    if (check.rows[0].is_default) throw new BadRequestException('Cannot delete default address');

    await this.pool.query(`DELETE FROM users.saved_addresses WHERE id = $1`, [addressId]);
  }
}