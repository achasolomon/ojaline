import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Query, UnauthorizedException, BadRequestException, Res } from '@nestjs/common';
import { loadConfig } from '@ojaline/config';
import { AuthService } from './auth.service.js';
import type { OAuthProvider } from './oauth.providers.js';

const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'facebook'];

@Controller('auth')
export class AuthController {
  private readonly config = loadConfig();

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { phone_or_email?: string; password?: string }) {
    if (!body.phone_or_email || !body.password) {
      throw new BadRequestException('Phone/email and password are required');
    }
    return this.auth.login(body.phone_or_email, body.password);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: { full_name?: string; phone?: string; email?: string; password?: string }) {
    if (!body.full_name || !body.phone || !body.password) {
      throw new BadRequestException('Name, phone and password are required');
    }
    return this.auth.register({
      full_name: body.full_name,
      phone: body.phone,
      email: body.email,
      password: body.password,
    });
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');
    return this.auth.me(token);
  }

  @Get('oauth/:provider/authorize')
  async oauthAuthorize(@Param('provider') provider: string, @Res() res: any) {
    this.assertOAuthProvider(provider);
    try {
      const url = await this.auth.oauthAuthorizeUrl(provider as OAuthProvider);
      return res.redirect(302, url);
    } catch (err) {
      // Unconfigured or provider-side setup problems must land on the app's
      // callback page with a readable message — never a raw 5xx to the browser.
      const msg = err instanceof Error ? err.message : 'Social login is not available right now.';
      return res.redirect(302, `${this.config.AUTH_APP_URL}/oauth/callback#error=${encodeURIComponent(msg)}`);
    }
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Res() res?: any,
  ) {
    this.assertOAuthProvider(provider);
    try {
      const { token } = await this.auth.oauthCallback(provider as OAuthProvider, code ?? '', state ?? '');
      this.redirectToApp(res, `#token=${encodeURIComponent(token)}`);
    } catch (err) {
      const msg =
        err instanceof BadRequestException || err instanceof UnauthorizedException
          ? err.message
          : 'Social login failed. Please try again.';
      this.redirectToApp(res, `#error=${encodeURIComponent(msg)}`);
    }
  }

  private assertOAuthProvider(provider: string): void {
    if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) {
      throw new BadRequestException('Unknown OAuth provider');
    }
  }

  private redirectToApp(res: any, hash: string): void {
    if (res) {
      return res.redirect(302, `${this.config.AUTH_APP_URL}/oauth/callback${hash}`);
    }
    throw new Error('OAuth callback requires a response object');
  }
}