import zlib from "node:zlib";

/**
 * Standard CRC-32 table for fast checksum computation.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Converts a Date to MS-DOS date and time format (used in ZIP headers).
 */
function toDosDateTime(date: Date): { time: number; date: number } {
  const d = new Date(date);
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { time: dosTime, date: dosDate };
}

export type ZipEntry = {
  path: string;
  content: string | Buffer;
  mtime?: Date;
};

/**
 * Creates a standard PKZip 2.0 buffer containing the specified entries.
 * Compresses file contents with DeflateRaw and uses UTF-8 path encoding.
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  const localHeadersAndData: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];

  let currentOffset = 0;

  for (const entry of entries) {
    // Normalize path (forward slashes, no leading slash)
    const normalizedPath = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const pathBuffer = Buffer.from(normalizedPath, "utf8");

    const rawData: Buffer = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content || '', 'utf8');

    const uncompressedSize = rawData.length;
    const checksum = crc32(rawData);

    // Deflate raw compression
    const deflated = zlib.deflateRawSync(rawData, { level: 6 });
    let compressedData: Buffer = deflated;
    let compressionMethod = 8; // Deflated

    // If compression makes it bigger (e.g. tiny files), store uncompressed
    if (deflated.length >= uncompressedSize) {
      compressedData = rawData;
      compressionMethod = 0; // Stored
    }

    const compressedSize = compressedData.length;
    const { time: dosTime, date: dosDate } = toDosDateTime(entry.mtime || new Date());

    // --- 1. Local File Header (30 bytes + filename length) ---
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // General purpose bit flag (Bit 11 = UTF-8)
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);   // Last mod file time
    localHeader.writeUInt16LE(dosDate, 12);   // Last mod file date
    localHeader.writeUInt32LE(checksum, 14);  // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(pathBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    const localChunk = Buffer.concat([localHeader, pathBuffer, compressedData]);
    localHeadersAndData.push(localChunk);

    // --- 2. Central Directory Header (46 bytes + filename length) ---
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8);     // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(pathBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal file attributes
    centralHeader.writeUInt32LE(0o644 << 16, 38); // External file attributes
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header

    centralDirectoryHeaders.push(Buffer.concat([centralHeader, pathBuffer]));

    currentOffset += localChunk.length;
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectoryBuffer = Buffer.concat(centralDirectoryHeaders);
  const centralDirectorySize = centralDirectoryBuffer.length;

  // --- 3. End of Central Directory Record (22 bytes) ---
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);                 // EOCD signature
  eocd.writeUInt16LE(0, 4);                          // Number of this disk
  eocd.writeUInt16LE(0, 6);                          // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8);             // Total entries on this disk
  eocd.writeUInt16LE(entries.length, 10);            // Total entries
  eocd.writeUInt32LE(centralDirectorySize, 12);      // Size of central directory
  eocd.writeUInt32LE(centralDirectoryOffset, 16);    // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                         // Comment length

  return Buffer.concat([...localHeadersAndData, centralDirectoryBuffer, eocd]);
}
