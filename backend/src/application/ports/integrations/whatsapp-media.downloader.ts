export type WhatsappMediaDownloadResult =
  | {
      ok: true;
      dataBase64: string;
    }
  | {
      ok: false;
      error: string;
    };

export abstract class WhatsappMediaDownloader {
  abstract downloadBase64(input: { body: Record<string, unknown> }): Promise<WhatsappMediaDownloadResult>;
}
