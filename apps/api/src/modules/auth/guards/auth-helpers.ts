import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../auth.service.js';

/** Requires an authenticated user; rejects anonymous callers with 401. */
export function requireAuth(user: AuthUser | undefined): AuthUser {
  if (!user) throw new UnauthorizedException('Authentication required');
  return user;
}

/**
 * Ownership enforcement: when a caller is authenticated, any identity supplied
 * in the request (query/body/param) must be their own. Anonymous callers are
 * allowed through so the guest/demo marketplace keeps working pre-login.
 */
export function assertOwnedOrAnon(user: AuthUser | undefined, requestId: string | undefined, what: string): void {
  if (user && requestId && user.id !== requestId) {
    throw new ForbiddenException(`${what} does not belong to the authenticated user`);
  }
}

/** Requires an authenticated user holding at least one of the given roles. */
export function requireRoles(user: AuthUser | undefined, roles: string[]): void {
  const authenticated = requireAuth(user);
  if (!roles.some((role) => authenticated.roles.includes(role))) {
    throw new ForbiddenException('Insufficient permissions');
  }
}