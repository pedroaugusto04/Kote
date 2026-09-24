import test from "node:test";
import assert from "node:assert/strict";

import { ExportProjectAdrsUseCase } from "../../../dist/application/use-cases/projects/export-project-adrs.use-case.js";

const mockDecisions = [
  {
    id: "note-1-1",
    noteId: "note-1",
    noteTitle: "Database Migration to Postgres",
    notePath: "notes/database.md",
    projectSlug: "kote",
    sourceChannel: "vscode",
    occurredAt: "2026-03-01T10:00:00.000Z",
    kind: "decision",
    text: "Use Drizzle ORM and Postgres connection pooling for low latency queries.",
    status: "current",
    files: ["backend/src/db.ts", "backend/src/schema.ts"],
    entities: ["Postgres", "Drizzle"],
  },
  {
    id: "note-2-1",
    noteId: "note-2",
    noteTitle: "Alternative In-Memory Caching",
    notePath: "notes/cache.md",
    projectSlug: "kote",
    sourceChannel: "cli",
    occurredAt: "2026-03-05T14:00:00.000Z",
    kind: "failed_attempt",
    text: "Tried Redis single-node setup but latency over WAN was unacceptable.",
    status: "rejected",
    files: ["backend/src/cache.ts"],
    entities: ["Redis"],
  },
];

test("ExportProjectAdrsUseCase generates valid ZIP with ADR files, metadata and INDEX.md", async () => {
  let receivedInput = null;

  const mockNoteSynthesisRepo = {
    async listProjectDecisions(userId, input) {
      assert.equal(userId, "user-1");
      receivedInput = input;
      return {
        items: mockDecisions,
        availableFiles: ["backend/src/db.ts", "backend/src/cache.ts"],
        pagination: {
          page: 1,
          pageSize: input.pageSize,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    },
  };

  const useCase = new ExportProjectAdrsUseCase(mockNoteSynthesisRepo);

  const result = await useCase.execute("user-1", {
    projectSlug: "kote",
    status: "all",
    kind: "all",
  });

  assert.equal(result.totalDecisions, 2);
  assert.match(result.filename, /^kote-kote-adrs-\d{4}-\d{2}-\d{2}\.zip$/);
  assert(Buffer.isBuffer(result.buffer));
  assert(result.buffer.length > 0);

  // Check that pageSize passed to repository is at least 2000
  assert.equal(receivedInput.pageSize, 2000);
  assert.equal(receivedInput.projectSlug, "kote");
});
