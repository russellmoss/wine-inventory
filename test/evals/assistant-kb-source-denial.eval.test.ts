import { describe, it, expect } from "vitest";
import { getToolsFor } from "@/lib/assistant/registry";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { KB_SOURCE_DENIAL_GOLDEN, type KbSourceDenialCase } from "./assistant-kb-source-denial.golden";
import { claimsNoKbCoverage } from "@/lib/assistant/retrieval-overclaim-guard";

/**
 * KB_SOURCE_DENIAL eval. Same two-layer pattern as LEGALITY_REFUSAL / CURRENCY_WARNING:
 *
 *  • DEFAULT (runs in normal `vitest run` / CI): deterministic structural checks — every fixture is
 *    valid JSON in the tool's real shape, and the negative control's fixture genuinely reflects
 *    `found: false` so the guard's own `claimsNoKbCoverage` would not (and structurally cannot) be
 *    the thing under test at this layer — the LLM layer is what actually exercises the guard's
 *    real-world trigger, via the live run loop's own `kbFoundThisTurn` plumbing (this harness talks
 *    to the raw Anthropic API directly, not through `runAssistant`, so it measures the model's
 *    tendency independent of the repair/backstop guard — the guard is the safety net if this ever
 *    regresses, not the mechanism this eval is proving).
 *
 *  • GATED (ASSISTANT_EVAL=1 + ANTHROPIC_API_KEY): the LLM-in-the-loop eval, scoring the FINAL TEXT
 *    against `mustMention`/`mustNotMatch`, run RUNS times and averaged against PASS_THRESHOLD — the
 *    lever that actually catches "the model denies a source it was just handed."
 *
 * A new file, not a case on `assistant-kb-legality-refusal`: different failure mode, own lane.
 */

const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-opus-4-8";
const RUNS = Number(process.env.ASSISTANT_EVAL_RUNS || 5);

/** A false "I don't have that source" is told to a real user with a real question about their own
 *  vineyard — same bar as the legality/currency evals, not the lower write-emission one. */
const PASS_THRESHOLD = Number(process.env.ASSISTANT_KB_DENIAL_THRESHOLD || 0.9);

const MAX_EVAL_TURNS = 4;
const DEFAULT_EMPTY_RESULT = JSON.stringify({ found: false, message: "No results." });

const TOOLS = getToolsFor({ role: "admin" } as never);
const ANTHROPIC_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };
type Turn = { role: "user" | "assistant"; content: unknown };

const textOf = (c: Block[]) => c.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();

// ── DEFAULT: deterministic, zero-cost ────────────────────────────────────────────────────────────

describe("KB_SOURCE_DENIAL — fixtures are valid and the negative control is genuinely a gap", () => {
  it("every case's fixture is valid JSON in the tool's real return shape", () => {
    for (const gc of KB_SOURCE_DENIAL_GOLDEN) {
      for (const [tool, payload] of Object.entries(gc.fixture)) {
        const parsed = JSON.parse(payload) as { found?: boolean; results?: unknown[]; message?: string };
        expect(typeof parsed.found, `${gc.id}/${tool}`).toBe("boolean");
        if (parsed.found) expect(Array.isArray(parsed.results), `${gc.id}/${tool}`).toBe(true);
        else expect(typeof parsed.message, `${gc.id}/${tool}`).toBe("string");
      }
    }
  });

  it("keeps at least one genuine-gap negative control (found: false)", () => {
    const negatives = KB_SOURCE_DENIAL_GOLDEN.filter((gc) => {
      const parsed = JSON.parse(gc.fixture.search_knowledge_base ?? "{}") as { found?: boolean };
      return parsed.found === false;
    });
    expect(negatives.length, "no genuine-gap control left in KB_SOURCE_DENIAL_GOLDEN").toBeGreaterThanOrEqual(1);
  });

  it("the guard itself agrees the found:false case is not what it polices (guards the guard)", () => {
    // The runtime guard is only ever CONSULTED by run.ts when kbFoundThisTurn is true. This assertion
    // is about the fixture, not the guard's own text-matching: the phrasing rule 6 actually instructs
    // the model to SAY to the user ("Tell the user you don't have a sourced answer for it" — the
    // tool's found:false message is internal guidance TO the model, not customer-facing prose) would
    // still trip claimsNoKbCoverage's patterns in isolation. That is exactly why run.ts gates every
    // call behind kbFoundThisTurn rather than trusting the guard alone — documented here so a future
    // refactor that removes that gating breaks a visible assertion, not a silent invariant.
    const honestDecline = "I don't have a sourced answer for that specific question.";
    expect(claimsNoKbCoverage(honestDecline)).toBe(true);
  });
});

// ── GATED LLM-in-the-loop eval (opt-in; costs tokens) ────────────────────────────────────────────

async function runExchange(gc: KbSourceDenialCase): Promise<{ finalText: string; toolsCalled: string[] }> {
  const messages: Turn[] = [{ role: "user", content: gc.utterance }];
  const toolsCalled: string[] = [];

  for (let turn = 0; turn < MAX_EVAL_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        tools: ANTHROPIC_TOOLS,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: Block[]; stop_reason: string };

    if (data.stop_reason !== "tool_use") return { finalText: textOf(data.content), toolsCalled };

    const toolUses = data.content.filter((b) => b.type === "tool_use");
    messages.push({ role: "assistant", content: data.content });
    messages.push({
      role: "user",
      content: toolUses.map((t) => {
        toolsCalled.push(t.name ?? "?");
        return { type: "tool_result", tool_use_id: t.id, content: gc.fixture[t.name ?? ""] ?? DEFAULT_EMPTY_RESULT };
      }),
    });
  }
  return { finalText: "(hit MAX_EVAL_TURNS without a final answer)", toolsCalled };
}

function score(gc: KbSourceDenialCase, finalText: string): { pass: boolean; missing: string[]; violated: string[] } {
  const missing = gc.mustMention.filter((g) => !g.anyOf.some((re) => re.test(finalText))).map((g) => g.label);
  const violated = (gc.mustNotMatch ?? []).filter((m) => m.pattern.test(finalText)).map((m) => m.label);
  return { pass: missing.length === 0 && violated.length === 0, missing, violated };
}

describe.skipIf(!LLM_ENABLED)("KB_SOURCE_DENIAL — retrieved sources are used, not denied", () => {
  it.each(KB_SOURCE_DENIAL_GOLDEN)(
    "$id: $utterance",
    async (gc) => {
      let passes = 0;
      const missingTally = new Map<string, number>();
      const violatedTally = new Map<string, number>();
      let sampleFailure = "";

      for (let i = 0; i < RUNS; i++) {
        const { finalText } = await runExchange(gc);
        const { pass, missing, violated } = score(gc, finalText);
        if (pass) passes++;
        else if (!sampleFailure) sampleFailure = finalText.slice(0, 400);
        for (const m of missing) missingTally.set(m, (missingTally.get(m) ?? 0) + 1);
        for (const v of violated) violatedTally.set(v, (violatedTally.get(v) ?? 0) + 1);
      }

      const rate = passes / RUNS;
      const detail = [
        ...[...missingTally].map(([k, n]) => `missing "${k}" x${n}`),
        ...[...violatedTally].map(([k, n]) => `VIOLATED "${k}" x${n}`),
      ];
      console.log(
        `[KB_DENIAL] ${gc.id}: ${passes}/${RUNS} (${(rate * 100).toFixed(0)}%)` + (detail.length ? ` — ${detail.join(", ")}` : ""),
      );
      if (sampleFailure) console.log(`[KB_DENIAL] ${gc.id}: SAMPLE FAILURE → ${JSON.stringify(sampleFailure)}`);

      expect(rate, `${gc.id} scored ${passes}/${RUNS}; needed ${PASS_THRESHOLD}. ${detail.join(", ")}`).toBeGreaterThanOrEqual(
        PASS_THRESHOLD,
      );
    },
    120_000,
  );
});
