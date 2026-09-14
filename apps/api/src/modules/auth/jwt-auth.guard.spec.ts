import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ExecutionContext, Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService, type AuthUser } from './auth.service.js';

const noMetadata = { getAllAndOverride: () => undefined } as unknown as Reflector;

function fakeContext(headers: Record<string, string | undefined> = {}) {
  const request = { headers, user: undefined as AuthUser | undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

function fakeUser(id = 'u1'): AuthUser {
  return { id, phone: null, email: null, full_name: 'Test', status: 'ACTIVE', seller_type: null, channel: 'RETAILER', roles: ['BUYER'] };
}

function fakeAuthService(overrides?: { verifyToken?: (token: string) => Promise<AuthUser> }) {
  return {
    verifyToken: overrides?.verifyToken ?? (async () => fakeUser()),
  } as unknown as AuthService;
}

describe('JwtAuthGuard', () => {
  it('allows anonymous access when no token and no @AuthRequired', async () => {
    const guard = new JwtAuthGuard(fakeAuthService(), noMetadata);
    const ctx = fakeContext({});
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('attaches user when bearer token is present', async () => {
    const user = fakeUser('own');
    const guard = new JwtAuthGuard(
      fakeAuthService({ verifyToken: async () => user }),
      noMetadata,
    );
    const ctx = fakeContext({ authorization: 'Bearer tok123' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    const req = (ctx.switchToHttp().getRequest() as any);
    expect(req.user?.id).toBe('own');
  });

  it('rejects with 401 when @AuthRequired and no token', async () => {
    const guard = new JwtAuthGuard(fakeAuthService(), {
      getAllAndOverride: (_key: string, _ctx: unknown[]) => true, // REQUIRED_AUTH_KEY = true
    } as unknown as Reflector);
    const ctx = fakeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Authentication required/);
  });

  it('allows access when @AuthRequired but token provided and valid', async () => {
    const guard = new JwtAuthGuard(
      fakeAuthService({ verifyToken: async () => fakeUser('own') }),
      { getAllAndOverride: (key: string) => key === 'requiredAuth' } as unknown as Reflector,
    );
    const ctx = fakeContext({ authorization: 'Bearer good' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});

describe('JwtAuthGuard (Nest DI)', () => {
  it('receives AuthService and Reflector when resolved through the real container', async () => {
    @Module({
      providers: [JwtAuthGuard, { provide: AuthService, useValue: fakeAuthService() }],
    })
    class HostModule {}

    const app = await NestFactory.createApplicationContext(HostModule, { logger: false });
    try {
      const guard = app.get(JwtAuthGuard);
      expect(guard).toBeInstanceOf(JwtAuthGuard);
      expect((guard as unknown as { reflector: unknown }).reflector).toBeInstanceOf(Reflector);
      const ctx = {
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, user: undefined as AuthUser | undefined }) }),
        getHandler: () => function handler() {},
        getClass: () => class Controller {},
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    } finally {
      await app.close();
    }
  });
});