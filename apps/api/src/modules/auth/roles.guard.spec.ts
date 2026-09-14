import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './guards/roles.guard.js';
import { assertOwnedOrAnon, requireAuth, requireRoles } from './guards/auth-helpers.js';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from './auth.service.js';

const rolesUser = (roles: string[]): AuthUser => ({ id: 'u1', roles, full_name: 'T', status: 'ACTIVE', phone: null, email: null, seller_type: null, channel: 'RETAILER' });

function ctxFor(roles: string[]) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: rolesUser(roles) }) }),
    getHandler: () => null,
    getClass: () => null,
  } as never;
}

describe('RolesGuard', () => {
  it('passes when no @Roles metadata', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => undefined } as unknown as Reflector);
    expect(guard.canActivate(ctxFor(['BUYER']))).toBe(true);
  });

  it('passes when the user holds a required role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: (_k: string) => ['OPS', 'AGENT'],
    } as unknown as Reflector);
    expect(guard.canActivate(ctxFor(['SELLER', 'OPS']))).toBe(true);
  });

  it('denies when user lacks required role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: (_k: string) => ['OPS'],
    } as unknown as Reflector);
    expect(guard.canActivate(ctxFor(['BUYER']))).toBe(false);
  });
});

describe('auth-helpers', () => {
  it('assertOwnedOrAnon allows anonymous callers', () => {
    expect(() => assertOwnedOrAnon(undefined, 'any-id', 'X')).not.toThrow();
  });

  it('assertOwnedOrAnon allows matching identity', () => {
    expect(() => assertOwnedOrAnon(rolesUser(['BUYER']), 'u1', 'X')).not.toThrow();
  });

  it('assertOwnedOrAnon rejects a mismatched identity (IDOR guard)', () => {
    expect(() => assertOwnedOrAnon(rolesUser(['BUYER']), 'victim-id', 'Orders list')).toThrow(ForbiddenException);
  });

  it('requireAuth rejects anonymous', () => {
    expect(() => requireAuth(undefined)).toThrow(UnauthorizedException);
  });

  it('requireRoles rejects missing role', () => {
    expect(() => requireRoles(rolesUser(['BUYER']), ['OPS'])).toThrow(ForbiddenException);
  });

  it('requireRoles passes when role present', () => {
    expect(() => requireRoles(rolesUser(['OPS']), ['OPS'])).not.toThrow();
  });
});