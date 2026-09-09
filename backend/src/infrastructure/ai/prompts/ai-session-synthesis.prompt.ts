import { z } from "zod";
import type { NoteSynthesisItem } from "../../../application/models/note-synthesis.models.js";

const itemSchema = z.object({
  kind: z.enum(["goal", "outcome", "decision", "change", "failed_attempt", "open_item", "fact"]),
  text: z.string().trim().min(1).max(1000),
  status: z.enum(["current", "historical", "rejected", "superseded", "unknown"]).default("unknown"),
  turnRefs: z.array(z.number().int().min(1)).max(12).default([]),
  files: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
  entities: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
});

const memoryKindAliases: Record<string, NoteSynthesisItem["kind"]> = {
  goal: "goal", goals: "goal", objective: "goal", objectives: "goal", intent: "goal",
  outcome: "outcome", outcomes: "outcome", result: "outcome", results: "outcome", achievement: "outcome",
  decision: "decision", decisions: "decision", choice: "decision", choices: "decision", architecture: "decision",
  change: "change", changes: "change", modification: "change", implementation: "change",
  failed_attempt: "failed_attempt", failed_attempts: "failed_attempt", failure: "failed_attempt", failures: "failed_attempt", attempt: "failed_attempt",
  open_item: "open_item", open_items: "open_item", todo: "open_item", todos: "open_item", question: "open_item", questions: "open_item", next_step: "open_item",
  fact: "fact", facts: "fact", context: "fact", insight: "fact", lesson: "fact", constraint: "fact",
};
const memoryStatusAliases: Record<string, NoteSynthesisItem["status"]> = {
  current: "current", active: "current", historical: "historical", past: "historical",
  rejected: "rejected", superseded: "superseded", replaced: "superseded", unknown: "unknown",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizedKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
}

function textFromItem(item: Record<string, unknown>): string | null {
  for (const key of ["text", "content", "summary", "description", "detail"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 1000);
  }
  return null;
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, maxLength)).slice(0, maxItems);
}

function normalizeTurnRefs(value: unknown): number[] {
  const values = Array.isArray(value) ? value : [];
  return values.map((item) => typeof item === "number" ? item : Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1).slice(0, 12);
}

function normalizeMemoryItem(value: unknown, fallbackKind: NoteSynthesisItem["kind"] = "fact"): Record<string, unknown> | null {
  if (typeof value === "string" && value.trim()) return { kind: fallbackKind, text: value.trim().slice(0, 1000), status: "unknown", turnRefs: [], files: [], entities: [] };
  const item = asRecord(value);
  if (!item) return null;
  const text = textFromItem(item);
  if (!text) return null;
  return {
    kind: memoryKindAliases[normalizedKey(item.kind)] || fallbackKind,
    text,
    status: memoryStatusAliases[normalizedKey(item.status)] || "unknown",
    turnRefs: normalizeTurnRefs(item.turnRefs),
    files: normalizeStringArray(item.files, 10, 180),
    entities: normalizeStringArray(item.entities, 10, 120),
  };
}

function normalizeMemory(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  const values = Array.isArray(value) ? value : Array.isArray(record?.items) ? record.items : null;
  if (values) return values.map((item) => normalizeMemoryItem(item)).filter((item): item is Record<string, unknown> => item !== null).slice(0, 40);
  if (!record) return [];
  if (textFromItem(record)) return [normalizeMemoryItem(record)].filter((item): item is Record<string, unknown> => item !== null);
  return Object.entries(record).flatMap(([kind, items]) => {
    const fallbackKind = memoryKindAliases[normalizedKey(kind)] || "fact";
    return (Array.isArray(items) ? items : [items]).map((item) => normalizeMemoryItem(item, fallbackKind));
  }).filter((item): item is Record<string, unknown> => item !== null).slice(0, 40);
}

const resultSchema = z.object({ overview: z.string().trim().min(1).max(2000), memory: z.array(itemSchema).max(40) });

export function buildAiSessionSynthesisSystemPrompt() {
  return `You synthesize an AI coding session into durable project memory. Return ONLY valid JSON with keys overview and memory. memory MUST be a flat array of atomic memory item objects; never return headings, topic groups, a single object, or an object wrapper. Every item MUST include kind and text. kind must be one of goal, outcome, decision, change, failed_attempt, open_item, or fact. text must be self-contained, concrete, and useful without the transcript; do not repeat the overview. The overview must be 1-3 concise prose sentences, with no Markdown headings or bullets. Never invent information, never expose chain-of-thought, and mark uncertainty as unknown. Preserve rejected or superseded alternatives with their status. turnRefs refer to the numbered transcript turns. Write in the dominant language of the transcript.`;
}

export function buildAiSessionSynthesisPrompt(transcript: string, language: string) {
  return JSON.stringify({ language, transcript });
}

export function parseAiSessionSynthesis(value: unknown): { overview: string; memory: NoteSynthesisItem[] } {
  const root = asRecord(value);
  const memory = normalizeMemory(root?.memory);
  const overview = typeof root?.overview === "string" && root.overview.trim()
    ? root.overview.trim().slice(0, 2000)
    : memory.map((item) => String(item.text)).join(" ").slice(0, 2000) || "No durable memory items were extracted from this session.";
  const parsed = resultSchema.parse({ overview, memory });
  return { overview: parsed.overview, memory: parsed.memory };
}
