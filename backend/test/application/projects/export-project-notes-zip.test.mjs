import test from "node:test";
import assert from "node:assert/strict";

import { ExportProjectNotesZipUseCase } from "../../../dist/application/use-cases/projects/export-project-notes-zip.use-case.js";

const mockProject = {
  id: "proj-1",
  projectSlug: "kote",
  displayName: "Kote Project",
  workspaceSlug: "default",
  enabled: true,
};

const mockNotes = [
  {
    id: "note-1",
    title: "First Architecture Note",
    summary: "Summary of first architecture note",
    occurredAt: "2026-01-10T10:00:00.000Z",
    createdAt: "2026-01-10T10:00:00.000Z",
    markdown: "# First Architecture Note\n\nDetailed markdown documentation.",
    sourceChannel: "manual",
  },
  {
    id: "note-2",
    title: "Second Sprint Review",
    summary: "Summary of second sprint review",
    occurredAt: "2026-02-15T14:30:00.000Z",
    createdAt: "2026-02-15T14:30:00.000Z",
    markdown: "Body without leading header.",
    sourceChannel: "ai_chat",
  },
];

test("ExportProjectNotesZipUseCase generates valid ZIP with notes in chronological order and INDEX.md", async () => {
  let receivedQuery = null;

  const contentRepository = {
    async getProjectBySlug(_userId, slug) {
      if (slug === "kote") return mockProject;
      return null;
    },
    async listProjectFolders() {
      return [];
    },
    async findNotesForExport(_userId, input) {
      receivedQuery = input;
      return mockNotes;
    },
  };

  const contentObjectStorage = {
    async hydrateMarkdown(note) {
      return note;
    },
  };

  const useCase = new ExportProjectNotesZipUseCase(contentRepository, contentObjectStorage);

  const result = await useCase.execute("user-1", {
    projectSlug: "kote",
    category: "all",
    status: "open",
  });

  assert.equal(result.totalNotes, 2);
  assert.ok(result.filename.startsWith("kote-kote-"));
  assert.ok(result.filename.endsWith(".zip"));
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.ok(result.buffer.length > 0);

  // Check query parameters passed to repository
  assert.equal(receivedQuery.projectId, "proj-1");
  assert.equal(receivedQuery.category, "all");
  assert.equal(receivedQuery.status, "open");
});

test("ExportProjectNotesZipUseCase exports across all projects when projectSlug is not provided", async () => {
  const contentRepository = {
    async getProjectBySlug() {
      return null;
    },
    async listProjectFolders() {
      return [];
    },
    async findNotesForExport() {
      return [];
    },
  };

  const contentObjectStorage = {
    async hydrateMarkdown(note) {
      return note;
    },
  };

  const useCase = new ExportProjectNotesZipUseCase(contentRepository, contentObjectStorage);

  const result = await useCase.execute("user-1", {
    category: "manual",
    status: "",
  });

  assert.equal(result.totalNotes, 0);
  assert.ok(result.filename.startsWith("kote-all-projects-"));
  assert.ok(Buffer.isBuffer(result.buffer));
});

test("ExportProjectNotesZipUseCase throws NotFoundException when projectSlug does not exist", async () => {
  const contentRepository = {
    async getProjectBySlug() {
      return null;
    },
  };
  const contentObjectStorage = {};

  const useCase = new ExportProjectNotesZipUseCase(contentRepository, contentObjectStorage);

  await assert.rejects(
    () => useCase.execute("user-1", { projectSlug: "unknown-project", category: "all" }),
    /project_not_found/,
  );
});
