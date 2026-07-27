import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { AuthService, type AuthenticatedUser } from '../../../../application/auth.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../../../application/ports/observability/runtime-environment.port.js';
import { readEnvironment } from '../../../../adapters/environment.js';

const AVATAR_MAX_SIZE_BYTES = readEnvironment().avatarMaxSizeBytes ?? 3 * 1024 * 1024;
import { CurrentUser } from '../../auth.decorators.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, BrowserExtensionGuard, TrustedOriginGuard } from '../../guards/auth.guards.js';
import { exchangeConnectionTokenBodySchema, loginBodySchema, signupBodySchema, updateProfileBodySchema, type ExchangeConnectionTokenBody, type LoginBody, type SignupBody, type UpdateProfileBody } from '../../dto/auth.dto.js';
import { clearAuthCookies, clearGoogleOAuthStateCookie, googleOAuthStateFromRequest, refreshTokenFromRequest, setAuthCookies, setGoogleOAuthStateCookie } from '../../http-security.js';
import { ZodValidationPipe } from '../../zod-validation.pipe.js';

type UploadedAvatarFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  private readonly environment: RuntimeEnvironment;

  constructor(
    private readonly auth: AuthService,
    private readonly environmentProvider: RuntimeEnvironmentProvider = { read: () => readEnvironment() },
  ) {
    this.environment = this.environmentProvider.read();
  }

  private getAvatarMaxSizeBytes(): number {
    return this.environment.avatarMaxSizeBytes ?? 3 * 1024 * 1024;
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard, BrowserExtensionGuard)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async login(
    @Body(new ZodValidationPipe(loginBodySchema, 'invalid_login_payload')) body: LoginBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.auth.login(body.email, body.password);
    setAuthCookies(response, tokens);
    
    // Return tokens in response body for browser extensions (they can't access Set-Cookie headers)
    const isBrowserExtension = request.headers.origin?.startsWith('chrome-extension://');
    if (isBrowserExtension) {
      return { 
        ok: true, 
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    }
    
    return { ok: true, user };
  }

  @Post('signup')
  @UseGuards(AuthRateLimitGuard, TrustedOriginGuard)
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({ status: 200, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async signup(
    @Body(new ZodValidationPipe(signupBodySchema, 'invalid_signup_payload')) body: SignupBody,
    @Req() _request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.auth.signup({
      email: body.email,
      password: body.password,
      name: body.name,
    });
    setAuthCookies(response, tokens);
    return { ok: true, user };
  }

  @Post('refresh')
  @UseGuards(AuthRateLimitGuard, TrustedOriginGuard)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { user, tokens } = await this.auth.refresh(refreshTokenFromRequest(request) || '');
    setAuthCookies(response, tokens);
    return { ok: true, user };
  }

  @Post('logout')
  @UseGuards(TrustedOriginGuard)
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  logout(@Req() _request: Request, @Res({ passthrough: true }) response: Response) {
    clearAuthCookies(response);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AccessTokenAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, user };
  }

  @Post('vscode-installed')
  @UseGuards(AccessTokenAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report VS Code extension installed (called by the extension after login)' })
  @ApiResponse({ status: 200, description: 'Recorded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async vsCodeInstalled(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.markVscodeInstalled(user.id);
    return { ok: true };
  }

  @Get('connection-token')
  @UseGuards(AccessTokenAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a connection token for CLI or IDE connection' })
  @ApiResponse({ status: 200, description: 'Connection token retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  connectionToken(@CurrentUser() user: AuthenticatedUser) {
    const token = this.auth.generateConnectionToken(user);
    return { ok: true, connectionToken: token };
  }

  @Post('exchange-connection-token')
  @UseGuards(AuthRateLimitGuard, BrowserExtensionGuard)
  @ApiOperation({ summary: 'Exchange connection token for user session tokens' })
  @ApiResponse({ status: 200, description: 'Tokens issued successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired connection token' })
  async exchangeConnectionToken(
    @Body(new ZodValidationPipe(exchangeConnectionTokenBodySchema, 'invalid_exchange_payload')) body: ExchangeConnectionTokenBody,
  ) {
    const tokens = await this.auth.exchangeConnectionToken(body.connectionToken);
    return {
      ok: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @Put('avatar')
  @UseGuards(AccessTokenAuthGuard, TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_SIZE_BYTES } }))
  async uploadAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedAvatarFile | undefined) {
    if (!file) throw new BadRequestException('avatar_file_required');
    return {
      ok: true,
      user: await this.auth.uploadAvatar({
        userId: user.id,
        buffer: file.buffer,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      }),
    };
  }

  @Delete('avatar')
  @UseGuards(AccessTokenAuthGuard, TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar deleted successfully' })
  async deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, user: await this.auth.deleteAvatar(user.id) };
  }

  @Get('avatar/content')
  @UseGuards(AccessTokenAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user avatar content' })
  @ApiResponse({ status: 200, description: 'Avatar content retrieved' })
  @ApiResponse({ status: 404, description: 'Avatar not found' })
  async avatarContent(@CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const content = await this.auth.getAvatarContent(user.id);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.send(content.body);
  }

  @Put('profile')
  @UseGuards(AccessTokenAuthGuard, TrustedOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileBodySchema, 'invalid_update_profile_payload')) body: UpdateProfileBody,
  ) {
    return {
      ok: true,
      user: await this.auth.updateProfile(user.id, body),
    };
  }

  @Get('google/start')
  @ApiOperation({ summary: 'Start Google OAuth flow' })
  @ApiQuery({ name: 'returnTo', required: false, description: 'URL to return to after authentication' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  startGoogle(@Query('returnTo') returnTo: string | undefined, @Req() request: Request, @Res() response: Response) {
    const protocol = this.environment.trustProxy ? (request.headers['x-forwarded-proto'] as string) || 'https' : request.protocol;
    const host = request.headers.host as string;
    
    // Validate host against allowed hosts to prevent header injection
    const hostWithoutPort = host.split(':')[0];
    if (this.environment.allowedHosts.length > 0 && !this.environment.allowedHosts.includes(hostWithoutPort)) {
      throw new BadRequestException('invalid_host_header');
    }
    
    // Extract base path from KB_API_PUBLIC_BASE_URL (e.g., /kote/api)
    const basePath = this.environment.apiPublicBaseUrl ? new URL(this.environment.apiPublicBaseUrl).pathname : '';
    const cleanBasePath = basePath.replace(/\/$/, '');
    const baseWithoutApi = cleanBasePath.replace(/\/api$/, '');
    const redirectUri = `${protocol}://${host}${baseWithoutApi}/api/auth/google/callback`;
    
    const result = this.auth.startGoogleOAuth({ returnTo, redirectUri });
    setGoogleOAuthStateCookie(response, result.stateCookie, result.stateCookieMaxAgeSeconds);
    response.redirect(result.authorizationUrl);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiQuery({ name: 'code', required: true, description: 'OAuth authorization code' })
  @ApiQuery({ name: 'state', required: true, description: 'OAuth state parameter' })
  @ApiResponse({ status: 302, description: 'Redirect to application' })
  @ApiResponse({ status: 400, description: 'OAuth error' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    try {
      const result = await this.auth.completeGoogleOAuth({
        code,
        state,
        stateCookie: googleOAuthStateFromRequest(request),
      });
      setAuthCookies(response, result.tokens);
      clearGoogleOAuthStateCookie(response);
      response.redirect(result.returnTo);
    } catch (error) {
      clearGoogleOAuthStateCookie(response);
      const codeParam = error instanceof ConflictException ? 'email_already_registered' : 'google_auth_failed';
      response.redirect(this.auth.googleOAuthErrorReturnTo({
        state,
        stateCookie: googleOAuthStateFromRequest(request),
        errorCode: codeParam,
      }));
    }
  }
}
