import { SetMetadata } from '@nestjs/common';

export const REQUIRED_AUTH_KEY = 'requiredAuth';

/** Requires a bearer token; rejects anonymous callers with 401. */
export const AuthRequired = () => SetMetadata(REQUIRED_AUTH_KEY, true);