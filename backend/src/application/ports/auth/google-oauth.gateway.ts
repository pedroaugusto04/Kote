export type GoogleOAuthProfile = {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  pictureUrl: string;
};

export abstract class GoogleOAuthGateway {
  abstract buildAuthorizationUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;

  abstract authenticate(input: { 
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<GoogleOAuthProfile>;
}
