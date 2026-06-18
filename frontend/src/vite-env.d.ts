/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WhatsApp bot phone number (digits only, with country code). e.g. 5531992504889 */
  readonly VITE_WHATSAPP_NUMBER?: string;
  /** Telegram bot username (without @). e.g. kb_notes_bot */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
