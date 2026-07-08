/**
 * Sanitizes text to redact common sensitive data patterns.
 * Targets credentials, API keys, tokens, and other secrets.
 *
 * Patterns covered:
 * - Passwords (password=, senha=, etc.)
 * - API Keys (api_key=, apikey=, etc.)
 * - Authentication tokens (token=, Bearer tokens, etc.)
 * - AWS credentials (AWS_SECRET_ACCESS_KEY, AKIA... keys)
 * - Private keys (RSA, OpenSSH, EC)
 * - Database URLs with embedded credentials
 * - URLs with embedded authentication
 */

const REDACTION_MARKER = '***';

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replace: (match: string) => string;
}

const redactionRules: RedactionRule[] = [
  // Private keys (PEM format blocks)
  {
    name: 'private-key-blocks',
    pattern: /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+(?:RSA\s+|OPENSSH\s+|EC\s+)?PRIVATE KEY-----/gi,
    replace: () => `[PRIVATE_KEY_REDACTED]`,
  },

  // URLs with embedded credentials (e.g., https://user:password@host)
  {
    name: 'url-with-credentials',
    pattern: /(?:[a-zA-Z][\w+.-]*:\/\/)[^:@\/\s]+:[^@\s]+@/gi,
    replace: (match) => {
      const protocol = match.match(/^[a-zA-Z][\w+.-]*:\/\//i)?.[0] || 'https://';
      return `${protocol}***:***@`;
    },
  },

  // Database connection strings (postgres, mysql, mongodb, mssql, redis, sqlserver, etc.)
  {
    name: 'database-urls',
    pattern: /(postgres|mysql|mongodb|postgresql|mssql|sqlserver|redis|rediss):\/\/[^:]+:[^@]+@/gi,
    replace: (match) => {
      const protocol = match.match(/^[^:]+/i)?.[0] || 'database';
      return `${protocol}://***:***@`;
    },
  },

  // Basic Auth headers
  {
    name: 'basic-auth-header',
    pattern: /(Authorization|authorization)\s*:\s*Basic\s+[A-Za-z0-9+/=]+/gi,
    replace: () => `Authorization: Basic ${REDACTION_MARKER}`,
  },

  // Anthropic API keys
  {
    name: 'anthropic-api-key',
    pattern: /sk-ant-[A-Za-z0-9_\-\.]{20,}/gi,
    replace: () => `sk-ant-${REDACTION_MARKER}`,
  },

  // OpenAI API keys (sk-...)
  {
    name: 'openai-api-key',
    pattern: /sk-[A-Za-z0-9_\-\.]{20,}/g,
    replace: () => `sk-${REDACTION_MARKER}`,
  },

  // Gemini API keys
  {
    name: 'gemini-api-key',
    pattern: /gemini[-_][A-Za-z0-9_\-\.]{16,}/gi,
    replace: () => `gemini-${REDACTION_MARKER}`,
  },

  // GitHub Personal Access Tokens
  {
    name: 'github-pat',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36}/g,
    replace: () => `ghp_${REDACTION_MARKER}`,
  },

  // GitLab personal access tokens
  {
    name: 'gitlab-pat',
    pattern: /glpat-[A-Za-z0-9_]{20,}/gi,
    replace: () => `glpat-${REDACTION_MARKER}`,
  },

  // Google API keys
  {
    name: 'google-api-key',
    pattern: /AIza[0-9A-Za-z_\-]{35}/g,
    replace: () => `AIza${REDACTION_MARKER}`,
  },

  // Azure key/secret env vars
  {
    name: 'azure-key-env',
    pattern: /(AZURE_[A-Z0-9_]*(?:KEY|SECRET))\s*[:=]\s*["']?[^"'\s\n]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // Cookie header and cookie assignments
  {
    name: 'cookie-header',
    pattern: /(Cookie|cookie)\s*:\s*[^\n]+/gi,
    replace: () => `Cookie: ${REDACTION_MARKER}`,
  },
  {
    name: 'cookie-assignment',
    pattern: /(COOKIE|cookie)\s*[:=]\s*["']?[^"'\s\n]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // AWS_SECRET_ACCESS_KEY or similar env vars with values
  {
    name: 'aws-secret-key-env',
    pattern: /(AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[:=]\s*["']?[A-Za-z0-9/+=]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0];
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // AWS Access Key IDs (AKIA prefix)
  {
    name: 'aws-access-key-id',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replace: () => `AKIA${REDACTION_MARKER}`,
  },

  // Generic password patterns (password=, senha=, etc.)
  {
    name: 'password-assignment',
    pattern: /(password|senha|passwd|pwd)\s*[:=]\s*["']?[^"'\s\n]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // API key patterns (api_key=, apikey=, etc.)
  {
    name: 'api-key-assignment',
    pattern: /(api[_-]?key|apikey|api-key)\s*[:=]\s*["']?[^"'\s\n]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // API key patterns in "is" context (e.g., "api_key is xxx")
  {
    name: 'api-key-value',
    pattern: /(api[_-]?key|apikey|api-key)\s+(?:is|:)\s+["']?[A-Za-z0-9_\-\.]+["']?/gi,
    replace: (match) => {
      const key = match.split(/(?:is|:)/)[0].trim();
      return `${key} is ${REDACTION_MARKER}`;
    },
  },

  // Token patterns (token=, access_token=, refresh_token=, etc.)
  {
    name: 'token-assignment',
    pattern: /([a-z_]*token[a-z_]*|auth[a-z_]*)\s*[:=]\s*["']?[A-Za-z0-9_\-\.]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // Bearer tokens in Authorization headers
  {
    name: 'bearer-token',
    pattern: /(bearer|Bearer)\s+[A-Za-z0-9_\-\.]+/gi,
    replace: () => `Bearer ${REDACTION_MARKER}`,
  },

  // JWT-like tokens (base64url with dots)
  {
    name: 'jwt-token',
    pattern: /eyJ[A-Za-z0-9_\-\.]+/g,
    replace: () => `${REDACTION_MARKER}`,
  },

  // Generic secret patterns (secret=, secret_key=, etc.)
  {
    name: 'secret-assignment',
    pattern: /(secret|secret[_-]?key)\s*[:=]\s*["']?[^"'\s\n]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },

  // Webhook URLs and tokens (common pattern: long alphanumeric strings after /webhook/)
  {
    name: 'webhook-token',
    pattern: /(webhook|hook)[_-]?[a-z]*\s*[:=]\s*["']?https?:\/\/[^"'\s]+["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=[WEBHOOK_URL_REDACTED]`;
    },
  },

  // Generic long tokens/hashes in common env var names
  {
    name: 'auth-value-long-string',
    pattern: /(authorization|auth|session[_-]?id|session|token[_-]?id)\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{32,}["']?/gi,
    replace: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=${REDACTION_MARKER}`;
    },
  },
];

/**
 * Redacts sensitive data from text.
 * @param text - The text to sanitize
 * @returns Sanitized text with sensitive data redacted
 */
export function redactSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let sanitized = text;

  for (const rule of redactionRules) {
    // Use lastIndex to test before replacing, accounting for 'g' flag
    const testPattern = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
    if (testPattern.test(sanitized)) {
      sanitized = sanitized.replace(rule.pattern, rule.replace);
      // Reset regex state after test/replace with global flag
      rule.pattern.lastIndex = 0;
    }
  }

  return sanitized;
}

/**
 * Detects if text contains sensitive data patterns.
 * Useful for logging or warning purposes.
 * @param text - The text to check
 * @returns Array of detected pattern names, or empty array if none found
 */
export function detectSensitiveData(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const detected: string[] = [];
  for (const rule of redactionRules) {
    if (rule.pattern.test(text)) {
      detected.push(rule.name);
    }
    // Reset regex state after test with global flag
    rule.pattern.lastIndex = 0;
  }
  return detected;
}

/**
 * Redacts sensitive data and returns both the sanitized text and detection info.
 * @param text - The text to sanitize
 * @returns Object containing sanitized text and array of detected patterns
 */
export function redactWithDetection(text: string): { sanitized: string; detected: string[] } {
  const detected = detectSensitiveData(text);
  const sanitized = redactSensitiveData(text);
  return { sanitized, detected };
}
