/**
 * Pi Review Agent — prompt, command builder, JSON event parser, and log formatter.
 *
 * Pi does not expose a structured-output CLI flag, so we run it in JSON event
 * mode with a read-only tool allowlist and parse the final assistant message as
 * the same severity-based JSON shape used by Claude review jobs.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types + schema
// ---------------------------------------------------------------------------

export type PiSeverity = "important" | "nit" | "pre_existing";

export interface PiFinding {
  severity: PiSeverity;
  file: string;
  line: number;
  end_line: number;
  description: string;
  reasoning: string;
}

export interface PiReviewOutput {
  findings: PiFinding[];
  summary: {
    important: number;
    nit: number;
    pre_existing: number;
  };
}

export const PI_REVIEW_SCHEMA_JSON = JSON.stringify({
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["important", "nit", "pre_existing"] },
          file: { type: "string" },
          line: { type: "integer" },
          end_line: { type: "integer" },
          description: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["severity", "file", "line", "end_line", "description", "reasoning"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "object",
      properties: {
        important: { type: "integer" },
        nit: { type: "integer" },
        pre_existing: { type: "integer" },
      },
      required: ["important", "nit", "pre_existing"],
      additionalProperties: false,
    },
  },
  required: ["findings", "summary"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Review prompt
// ---------------------------------------------------------------------------

export const PI_REVIEW_PROMPT = `# Pi Code Review System Prompt

## Identity
You are a code review system. Your job is to find bugs that would break
production. You are not a linter, formatter, or style checker unless project
guidance files explicitly expand your scope.

## Tool policy
You are running as a read-only Plannotator review agent. You may inspect local
files with read, grep, find, and ls only. Do not attempt to edit files, write
files, run shell commands, access the network, or post comments to GitHub or
GitLab. If needed context is unavailable with read-only tools, say so in the
reasoning for the relevant finding or return no finding.

## Review pipeline
1. Read the supplied diff and task context carefully.
2. Inspect nearby code with read/grep/find/ls when needed to prove a finding.
3. Check repository guidance files that are already in context and any relevant
   nearby AGENTS.md, CLAUDE.md, or REVIEW.md files discoverable with read-only
   tools.
4. Flag only actionable issues the original author would likely fix.
5. Prefer silence over false positives. Drop speculative or unproven issues.

## Severity
Assign exactly one severity to each finding:

- important: A bug that should be fixed before merging. Build failures, clear
  logic errors, security vulnerabilities with exploit paths, data loss risks, or
  race conditions with observable consequences.
- nit: A minor issue worth fixing but non-blocking. Style or convention issues
  only count when project guidance explicitly says they matter.
- pre_existing: A bug in the surrounding codebase that was NOT introduced by
  this change. Only include it when directly relevant to changed code.

## Finding rules
- One finding per distinct issue.
- Use the shortest line range that pinpoints the problem, preferably 1-5 lines.
- File paths must match the diff paths. In workspace reviews, keep the child
  repository prefix exactly as shown in the diff.
- Do not flag missing tests unless project guidance explicitly requires them.
- Do not approve, reject, summarize, or post external comments.
- Do not include markdown fences, prose before JSON, or prose after JSON.

## Output schema
Your only output is one JSON object matching this schema:

${PI_REVIEW_SCHEMA_JSON}

If no issues are found, return:
{"findings":[],"summary":{"important":0,"nit":0,"pre_existing":0}}`;

// ---------------------------------------------------------------------------
// Command builder
// ---------------------------------------------------------------------------

export interface PiCommandOptions {
  cwd: string;
  prompt: string;
  model?: string;
  thinking?: string;
}

export interface PiCommandResult {
  command: string[];
  /** Temporary prompt file passed to Pi as an @file argument. */
  promptPath: string;
}

/** Build the `pi --mode json` argv array and materialize the prompt file. */
export async function buildPiCommand(options: PiCommandOptions): Promise<PiCommandResult> {
  const { prompt, model, thinking } = options;
  const promptPath = generatePiPromptPath();
  await writeFile(promptPath, prompt, "utf-8");

  return {
    command: [
      "pi",
      "--mode", "json",
      "--no-session",
      "--name", "Plannotator code review",
      "--tools", "read,grep,find,ls",
      "--no-extensions",
      "--no-skills",
      ...(model ? ["--model", model] : []),
      ...(thinking ? ["--thinking", thinking] : []),
      `@${promptPath}`,
    ],
    promptPath,
  };
}

export function generatePiPromptPath(): string {
  return join(tmpdir(), `plannotator-pi-review-${randomUUID()}.md`);
}

export async function cleanupPiPromptFile(promptPath?: string): Promise<void> {
  if (!promptPath) return;
  try { await unlink(promptPath); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// JSON event output parser
// ---------------------------------------------------------------------------

export function parsePiJsonReviewOutput(stdout: string): PiReviewOutput | null {
  if (!stdout.trim()) return null;

  let finalAssistantText = "";
  let lastMessageEndText = "";

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = extractAssistantText(event.message);
      if (text) lastMessageEndText = text;
    }

    if (event.type === "agent_end" && Array.isArray(event.messages)) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const message = event.messages[i];
        if (message?.role === "assistant") {
          const text = extractAssistantText(message);
          if (text) {
            finalAssistantText = text;
            break;
          }
        }
      }
    }
  }

  return parsePiReviewText(finalAssistantText || lastMessageEndText);
}

export function parsePiReviewText(text: string): PiReviewOutput | null {
  const candidates = jsonCandidates(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizePiReviewOutput(parsed);
      if (normalized) return normalized;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];
  if (trimmed) candidates.push(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}

function normalizePiReviewOutput(value: any): PiReviewOutput | null {
  if (!value || !Array.isArray(value.findings)) return null;

  const findings: PiFinding[] = [];
  const counts = { important: 0, nit: 0, pre_existing: 0 };

  for (const item of value.findings) {
    const severity = normalizeSeverity(item?.severity);
    const file = typeof item?.file === "string" ? item.file : "";
    const line = toPositiveInteger(item?.line);
    const endLine = toPositiveInteger(item?.end_line ?? item?.line);
    const description = typeof item?.description === "string" ? item.description.trim() : "";
    const reasoning = typeof item?.reasoning === "string" ? item.reasoning.trim() : "";

    if (!severity || !file || !line || !endLine || !description) continue;

    findings.push({
      severity,
      file,
      line,
      end_line: Math.max(line, endLine),
      description,
      reasoning,
    });
    counts[severity]++;
  }

  const summary = value.summary && typeof value.summary === "object"
    ? {
        important: toNonNegativeInteger(value.summary.important) ?? counts.important,
        nit: toNonNegativeInteger(value.summary.nit) ?? counts.nit,
        pre_existing: toNonNegativeInteger(value.summary.pre_existing) ?? counts.pre_existing,
      }
    : counts;

  return { findings, summary };
}

function normalizeSeverity(value: unknown): PiSeverity | null {
  return value === "important" || value === "nit" || value === "pre_existing" ? value : null;
}

function toPositiveInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function extractAssistantText(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Live log formatter
// ---------------------------------------------------------------------------

export function formatPiJsonLogEvent(line: string): string | null {
  try {
    const event = JSON.parse(line);

    if (event.type === "session") return null;
    if (event.type === "agent_start") return "Pi review started\n";
    if (event.type === "agent_end") return "Pi review finished\n";

    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent;
      if (delta?.type === "text_delta" && typeof delta.delta === "string") return delta.delta;
      if (delta?.type === "toolcall_start") return `[tool] ${delta.toolName ?? "tool"}\n`;
      return null;
    }

    if (event.type === "tool_execution_start") {
      return `[${event.toolName ?? "tool"}] ${formatCompactJson(event.args)}\n`;
    }

    if (event.type === "tool_execution_end") {
      return `[${event.toolName ?? "tool"} ${event.isError ? "failed" : "done"}]\n`;
    }

    if (event.type === "auto_retry_start") return `[retry] ${event.errorMessage ?? "retrying"}\n`;
    if (event.type === "auto_retry_end" && event.success === false) return `[retry failed] ${event.finalError ?? "failed"}\n`;

    return null;
  } catch {
    return null;
  }
}

function formatCompactJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return "";
  }
}
