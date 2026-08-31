import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import { createZipArchive, crc32 } from "../../../dist/domain/utils/zip.utils.js";

test("crc32 calculates correct checksums", () => {
  const buf = Buffer.from("hello world", "utf8");
  const checksum = crc32(buf);
  assert.equal(typeof checksum, "number");
  assert.ok(checksum > 0);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("createZipArchive generates valid PKZip binary buffer with multiple files and INDEX", () => {
  const entries = [
    {
      path: "INDEX.md",
      content: "# Index\n- Item 1\n- Item 2",
      mtime: new Date("2026-03-01T10:00:00Z"),
    },
    {
      path: "notes/001_2026-01-15_first-note.md",
      content: "# First Note\n\nContent here with UTF-8: Acentuação e emojis 🚀",
      mtime: new Date("2026-01-15T12:00:00Z"),
    },
    {
      path: "notes/002_2026-02-20_second-note.md",
      content: Buffer.from("# Second Note\n\nBinary buffer content", "utf8"),
      mtime: new Date("2026-02-20T15:30:00Z"),
    },
  ];

  const zipBuffer = createZipArchive(entries);

  assert.ok(Buffer.isBuffer(zipBuffer));
  assert.ok(zipBuffer.length > 100);

  // Check PK\x03\x04 signature at beginning
  assert.equal(zipBuffer.readUInt32LE(0), 0x04034b50);

  // Check EOCD signature PK\x05\x06 near the end
  const eocdSignature = 0x06054b50;
  let foundEocd = false;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === eocdSignature) {
      foundEocd = true;
      const totalEntries = zipBuffer.readUInt16LE(i + 10);
      assert.equal(totalEntries, 3);
      break;
    }
  }
  assert.ok(foundEocd, "EOCD signature must be present in zip");
});
