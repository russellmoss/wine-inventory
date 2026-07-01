import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_DISCLAIMER, type AnomalyFinding } from "./anomaly";

// Unit 11 — the ADVISORY LLM readiness pass. Reuses the assistant's Anthropic client + model. It only
// summarizes the deterministic findings in plain English + suggests Part X wording. It NEVER gates
// filing (only the deterministic checks do) and always carries the disclaimer (OV#5). Falls back to a
// deterministic note if the key is unset or the call fails — never throws.

const MODEL = "claude-opus-4-8";

export type ReadinessInput = {
  periodLabel: string;
  balanced: boolean;
  status: "DRAFT" | "FILED";
  findings: AnomalyFinding[];
  summaryLines: string[];
};

function fallbackNote(input: ReadinessInput): string {
  const blockers = input.findings.filter((f) => f.severity === "blocker");
  if (input.status === "FILED") return "This report is filed. It's immutable — regenerate a new version to make changes.";
  if (blockers.length > 0) return `Not ready to file: ${blockers.map((b) => b.message).join(" ")}`;
  const warnings = input.findings.filter((f) => f.severity === "warning");
  if (warnings.length > 0) return `No hard blockers, but review ${warnings.length} item(s) and add Part X where noted before filing.`;
  return "No blockers detected. The columns balance — review the figures, then you can mark it filed.";
}

export async function assessReadiness(input: ReadinessInput): Promise<{ note: string; disclaimer: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { note: fallbackNote(input), disclaimer: AI_DISCLAIMER };
  try {
    const client = new Anthropic();
    const prompt = [
      "You help a US winemaker decide if their TTB F 5120.17 (Report of Wine Premises Operations) is ready to file.",
      "Be concise (3–5 sentences), plain-spoken, and practical. Do NOT give legal or tax advice.",
      "",
      `Period: ${input.periodLabel}`,
      `Report status: ${input.status}`,
      `Every column balances: ${input.balanced}`,
      "Deterministic findings:",
      input.findings.length ? input.findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n") : "- none",
      "Key figures:",
      ...input.summaryLines,
      "",
      "Say whether they're ready to file and, if not, what to fix first. If a shortage/loss is present, suggest one sentence of Part X wording.",
    ].join("\n");
    const msg = await client.messages.create({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { note: text || fallbackNote(input), disclaimer: AI_DISCLAIMER };
  } catch {
    return { note: fallbackNote(input), disclaimer: AI_DISCLAIMER };
  }
}
