import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

import { GoogleOAuthGateway, type GoogleOAuthProfile } from '../../application/ports/auth/google-oauth.gateway.js';

@Injectable()
export class GoogleAuthLibraryOAuthGateway extends GoogleOAuthGateway {
  buildAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
    const client = new OAuth2Client(input.clientId, undefined, input.redirectUri);
    return client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      response_type: 'code',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }

  async authenticate(input: { clientId: string; clientSecret: string; redirectUri: string; code: string; codeVerifier: string }): Promise<GoogleOAuthProfile> {
    const client = new OAuth2Client(input.clientId, input.clientSecret, input.redirectUri);
    const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.codeVerifier, redirect_uri: input.redirectUri });
    if (!tokens.id_token) throw new UnauthorizedException('google_auth_failed');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: input.clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('google_auth_failed');
    return {
      providerUserId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      displayName: String(payload.name || payload.email.split('@')[0] || 'Google User').trim(),
      pictureUrl: String(payload.picture || '').trim(),
    };
  }
}
