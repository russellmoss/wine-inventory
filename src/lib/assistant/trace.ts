import "server-only";
import { createHash } from "node:crypto";

const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[_-]?key|nonce)/i;
const MAX_STRING = 1000;
const MAX_ARRAY = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_TOOL_CALLS = 40;

export type AssistantToolTrace = {
  name: string;
  input: unknown;
  ok?: boolean;
  resultKind?: "text" | "json" | "proposal" | "draft_proposal" | "choice" | "navigation" | "error";
  resultPreview?: string;
};

export type AssistantTrace = {
  schemaVersion: 1;
  model: string;
  maxTurns: number;
  promptHash: string;
  toolNames: string[];
  toolCalls: AssistantToolTrace[];
  stopReason?: string;
  turns: number;
};

export function newAssistantTrace(args: {
  model: string;
  maxTurns: number;
  systemPrompt: string;
  toolNames: string[];
}): AssistantTrace {
  return {
    schemaVersion: 1,
    model: args.model,
    maxTurns: args.maxTurns,
    promptHash: createHash("sha256").update(args.systemPrompt).digest("hex").slice(0, 16),
    toolNames: args.toolNames.slice(0, 100),
    toolCalls: [],
    turns: 0,
  };
}

export function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value);
  if (depth >= 5) return "[max-depth]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((v) => sanitizeTraceValue(v, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeTraceValue(child, depth + 1);
  }
  return out;
}

export function previewTraceValue(value: unknown): string {
  const safe = sanitizeTraceValue(value);
  const raw = typeof safe === "string" ? safe : JSON.stringify(safe);
  return raw.length > MAX_STRING ? `${raw.slice(0, MAX_STRING)}...` : raw;
}

export function pushToolTrace(trace: AssistantTrace, call: AssistantToolTrace): void {
  if (trace.toolCalls.length >= MAX_TOOL_CALLS) return;
  trace.toolCalls.push({
    ...call,
    input: sanitizeTraceValue(call.input),
    ...(call.resultPreview ? { resultPreview: call.resultPreview.slice(0, MAX_STRING) } : {}),
  });
}
