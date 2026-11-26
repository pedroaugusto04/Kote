export interface ExtensionStorage {
  accessToken?: string;
  apiUrl?: string;
  authMethod?: 'token' | 'email';
  connectionToken?: string;
  defaultProject?: string;
  refreshToken?: string;
}
