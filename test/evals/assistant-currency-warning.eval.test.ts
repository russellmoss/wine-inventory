import { describe, it, expect } from "vitest";
import { getToolsFor } from "@/lib/assistant/registry";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { CURRENCY_GOLDEN, type CurrencyCase } from "./assistant-currency-warning.golden";

/**
 * CURRENCY_WARNING eval — does the model actually SAY a passage is old?
 *
 * `knowledge-passage-age.test.ts` proves the age is computed and attached. This proves the part that
 * protects the winemaker: that a passage carrying an `ageWarning` produces an answer which states the
 * age and sends the user to the current label, rather than quoting a 2015 spray rate flat.
 *
 * Shares the MUST_PROPOSE architecture for the same reasons documented there:
 *   - `tool_choice` is OMITTED, so the model decides for itself whether to search. Forcing the call
 *     would measure a different system than the one that ships.
 *   - Read-tool results are STUBBED from the case fixture, so the assertion is about the model's
 *     handling of a known payload rather than about whatever the live corpus happens to return today.
 *     That also makes the case deterministic as the backfill changes real dates underneath it.
 *   - Behaviour is stochastic, so each case runs N times and a pass RATE is asserted.
 *
 * Unlike MUST_PROPOSE this scores the FINAL TEXT, not the tool call — the failure mode here is what the
 * model says, not what it invokes.
 */

const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-opus-4-8";
const RUNS = Number(process.env.ASSISTANT_EVAL_RUNS || 5);

/**
 * Safety-relevant behaviour, so this sits higher than the 0.9 card-emission bar: an answer that drops
 * the age on a stale spray rate is not a cosmetic miss.
 */
const PASS_THRESHOLD = Number(process.env.ASSISTANT_CURRENCY_THRESHOLD || 0.9);

const MAX_EVAL_TURNS = 4;
const DEFAULT_EMPTY_RESULT = JSON.stringify({ found: false, message: "No results." });

const TOOLS = getToolsFor({ role: "admin" } as never);
const ANTHROPIC_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };
type Turn = { role: "user" | "assistant"; content: unknown };

const textOf = (c: Block[]) =>
  c.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();

/** Run one exchange to a final text answer, stubbing every tool call from the fixture. */
async function runExchange(gc: CurrencyCase): Promise<{ finalText: string; toolsCalled: string[] }> {
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
        return {
          type: "tool_result",
          tool_use_id: t.id,
          content: gc.fixture[t.name ?? ""] ?? DEFAULT_EMPTY_RESULT,
        };
      }),
    });
  }
  return { finalText: "(hit MAX_EVAL_TURNS without a final answer)", toolsCalled };
}

/** A run passes only if EVERY mustMention group matches and NO mustNotMatch pattern does. */
function score(gc: CurrencyCase, finalText: string): { pass: boolean; missing: string[]; violated: string[] } {
  const missing = gc.mustMention
    .filter((g) => !g.anyOf.some((re) => re.test(finalText)))
    .map((g) => g.label);
  const violated = (gc.mustNotMatch ?? [])
    .filter((m) => m.pattern.test(finalText))
    .map((m) => m.label);
  return { pass: missing.length === 0 && violated.length === 0, missing, violated };
}

describe.skipIf(!LLM_ENABLED)("CURRENCY_WARNING — stale guidance is called stale", () => {
  it.each(CURRENCY_GOLDEN)(
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
        `[CURRENCY] ${gc.id}: ${passes}/${RUNS} (${(rate * 100).toFixed(0)}%)` +
          (detail.length ? ` — ${detail.join(", ")}` : ""),
      );
      if (sampleFailure) console.log(`[CURRENCY] ${gc.id}: SAMPLE FAILURE → ${JSON.stringify(sampleFailure)}`);

      expect(
        rate,
        `${gc.id} scored ${passes}/${RUNS}; needed ${PASS_THRESHOLD}. ${detail.join(", ")}`,
      ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    },
    120_000,
  );
});
