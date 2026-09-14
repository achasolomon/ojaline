import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Requires the authenticated user to hold at least one of the given roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);