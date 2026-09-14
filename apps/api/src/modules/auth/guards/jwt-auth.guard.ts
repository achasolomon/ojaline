import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REQUIRED_AUTH_KEY } from '../decorators/auth-required.decorator.js';
import { AuthService, type AuthUser } from '../auth.service.js';

/**
 * Optional-auth guard: attaches the authenticated user to `request.user` when a
 * bearer token is present, and leaves it undefined for anonymous (demo) callers.
 *
 * Routes are always reachable anonymously unless they carry `@AuthRequired()`.
 * Ownership is then enforced by the handler helpers (`assertOwnedOrAnon`,
 * `requireRoles`), so an authenticated caller can never act as another user while
 * the guest/demo marketplace keeps working pre-login.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAuthRequired = this.reflector.getAllAndOverride<boolean>(REQUIRED_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic && !isAuthRequired) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const authorization = request.headers['authorization'];
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

    if (token) {
      request.user = await this.auth.verifyToken(token);
    } else if (isAuthRequired) {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}