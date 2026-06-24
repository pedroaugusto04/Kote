const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_LOGO_ASSET_PATH = 'Kote-Brand.png';
const DEFAULT_APP_NAME = 'Kote';

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const joinUrlPath = (baseUrl: string, path: string): string => {
  const cleanBase = stripTrailingSlash(baseUrl);
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isInlineImageReference = (value: string): boolean => value.startsWith('data:') || value.startsWith('cid:');
const isSvgReference = (value: string): boolean => /\.svg(?:$|\?|#)/i.test(value);

export const resolveEmailFrontUrl = (): string => {
  const configuredUrl = process.env.KB_PUBLIC_BASE_URL || process.env.APP_URL || DEFAULT_FRONTEND_URL;
  const normalized = stripTrailingSlash(configuredUrl.trim() || DEFAULT_FRONTEND_URL);
  return normalized || DEFAULT_FRONTEND_URL;
};

export const resolveEmailLogoUrl = (frontUrl = resolveEmailFrontUrl()): string => {
  const configuredLogoUrl = process.env.APP_LOGO_URL?.trim();
  if (configuredLogoUrl) {
    if (isSvgReference(configuredLogoUrl)) {
      return joinUrlPath(frontUrl, DEFAULT_LOGO_ASSET_PATH);
    }

    if (isAbsoluteUrl(configuredLogoUrl) || isInlineImageReference(configuredLogoUrl)) {
      return configuredLogoUrl;
    }

    return joinUrlPath(frontUrl, configuredLogoUrl);
  }

  return joinUrlPath(frontUrl, DEFAULT_LOGO_ASSET_PATH);
};

export const resolveEmailAppName = (): string => process.env.APP_NAME?.trim() || DEFAULT_APP_NAME;
