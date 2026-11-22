import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | null = null;
let isInitialized = false;

export function getLangfuse(): Langfuse | null {
  if (isInitialized) {
    return langfuseInstance;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = (process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL || 'http://127.0.0.1:3000').trim();

  if (!publicKey || !secretKey) {
    isInitialized = true;
    langfuseInstance = null;
    return null;
  }

  try {
    langfuseInstance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });
  } catch {
    langfuseInstance = null;
  }

  isInitialized = true;
  return langfuseInstance;
}
