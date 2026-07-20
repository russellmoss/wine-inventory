import { describe, it, expect } from "vitest";
import { getToolsFor } from "@/lib/assistant/registry";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import {
  MUST_PROPOSE_GOLDEN,
  MUST_NOT_PROPOSE_GOLDEN,
  DEFAULT_EMPTY_RESULT,
  type MustProposeCase,
} from "./assistant-must-propose.golden";

/**
 * MUST_PROPOSE eval — plan 081 U9.
 *
 * The regression net for the card-emission bug. Two things make it different from
 * `assistant-tools.eval.test.ts`:
 *
 *  1. `tool_choice` is OMITTED. That eval sends `{type:"any"}`, which mechanically guarantees a
 *     tool_use block and then asks which tool — so it can never observe "no tool was called", which is
 *     precisely the bug. Omitting it is the entire point of this file.
 *
 *  2. Runs are CLASSIFIED, not booleaned. Per council S4, `content.some(b => b.type === "tool_use")`
 *     passes on a wrong tool. Each run lands in exactly one bucket — complete / partial / wrong-tool /
 *     no-tool — and the buckets are asserted separately.
 *
 * Behaviour is stochastic, so each case runs N times and a pass RATE is asserted; the observed rate is
 * printed so the fix is provably what moved it (the seeded repro's pre-fix baseline was 2/7).
 *
 * Uses the production model and the REAL system prompt — plan 081 U6 changed that prompt, and evaluating
 * against a different one would measure nothing.
 */

const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-opus-4-8";
const RUNS = Number(process.env.ASSISTANT_EVAL_RUNS || 5);

/** ready+draft combined must clear this. Pre-fix baseline on the seeded repro was 2/7 ≈ 0.29. */
const CARD_RATE_THRESHOLD = Number(process.env.ASSISTANT_EVAL_THRESHOLD || 0.9);

const TOOLS = getToolsFor({ role: "admin" } as never);
const ANTHROPIC_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

type Outcome = "complete" | "partial" | "wrong-tool" | "no-tool";
type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };
type Turn = { role: "user" | "assistant"; content: unknown };

const WRITE_TOOL_NAMES = new Set(TOOLS.filter((t) => t.kind === "write").map((t) => t.name));
const MAX_EVAL_TURNS = 4;

/**
 * Run ONE exchange to completion, exactly as the real loop would: read tools get a stubbed result and
 * the model continues; the run stops as soon as a WRITE tool is called (that is the card) or the model
 * ends its turn without one (that is the bug).
 *
 * Measured, not assumed: a single-call version of this eval scored 0/3 on the seeded repro because the
 * model's FIRST move is `query_cellar_contents` — which the prompt explicitly tells it to do before
 * proposing. Stopping there measures the read, not the card.
 */
async function runExchange(gc: { utterance: string; fixture?: Record<string, string> }): Promise<{
  writeCalls: Block[];
  readCalls: string[];
  finalText: string;
}> {
  const messages: Turn[] = [{ role: "user", content: gc.utterance }];
  const readCalls: string[] = [];

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
        // NO tool_choice. This is the whole experiment: forcing a call would guarantee the very thing
        // being measured, and would make a missing required field get fabricated (council C1).
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: Block[]; stop_reason: string };
    const toolUses = data.content.filter((b) => b.type === "tool_use");

    const writeCalls = toolUses.filter((t) => WRITE_TOOL_NAMES.has(t.name ?? ""));
    const textOf = (c: Block[]) => c.filter((b) => b.type === "text").map((b) => (b as { text?: string }).text ?? "").join(" ").trim();
    if (writeCalls.length > 0) return { writeCalls, readCalls, finalText: textOf(data.content) };
    if (data.stop_reason !== "tool_use") return { writeCalls: [], readCalls, finalText: textOf(data.content) };

    // Feed the reads back and let it continue, same as runAssistant does.
    messages.push({ role: "assistant", content: data.content });
    messages.push({
      role: "user",
      content: toolUses.map((t) => {
        readCalls.push(t.name ?? "?");
        return {
          type: "tool_result",
          tool_use_id: t.id,
          content: gc.fixture?.[t.name ?? ""] ?? DEFAULT_EMPTY_RESULT,
        };
      }),
    });
  }
  return { writeCalls: [], readCalls, finalText: "(hit MAX_EVAL_TURNS without writing)" };
}

function classify(gc: MustProposeCase, writeCalls: Block[]): { outcome: Outcome; fabricated: string[] } {
  const match = writeCalls.find((t) => t.name === gc.tool);
  if (!match) return { outcome: writeCalls.length > 0 ? "wrong-tool" : "no-tool", fabricated: [] };

  const args = match.input ?? {};
  const has = (k: string) => args[k] != null && args[k] !== "";
  return {
    outcome: gc.readyRequires.every(has) ? "complete" : "partial",
    fabricated: (gc.unknowable ?? []).filter(has).map((k) => `${k}=${JSON.stringify(args[k])}`),
  };
}

function tally(outcomes: Outcome[]) {
  const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return {
    complete: count("complete"),
    partial: count("partial"),
    wrongTool: count("wrong-tool"),
    noTool: count("no-tool"),
    /** complete + partial: a tool call happened, so a card (Ready or Draft) reaches the screen. */
    card: count("complete") + count("partial"),
    total: outcomes.length,
  };
}

describe.skipIf(!LLM_ENABLED)("MUST_PROPOSE — a write request always yields a card", () => {
  it.each(MUST_PROPOSE_GOLDEN)(
    "$id: $utterance",
    async (gc) => {
      const outcomes: Outcome[] = [];
      const fabrications: string[] = [];
      // Which READ tools the model reached for. Load-bearing for triage: an unstubbed read returns
      // DEFAULT_EMPTY_RESULT, which for a case whose premise is "this record exists" tells the model
      // the opposite and can talk it out of writing at all. Without this you cannot tell that apart
      // from the model simply declining.
      const reads: string[] = [];
      const declines: string[] = [];

      // Explicit loop: vitest has no `repeats` configured here, and each run must be an independent
      // single-turn sample — no shared conversation state, exactly like a fresh chat.
      for (let i = 0; i < RUNS; i++) {
        const { writeCalls, readCalls, finalText } = await runExchange(gc);
        reads.push(...readCalls);
        if (writeCalls.length === 0 && finalText) declines.push(finalText.slice(0, 220));
        const { outcome, fabricated } = classify(gc, writeCalls);
        outcomes.push(outcome);
        fabrications.push(...fabricated);
      }

      const t = tally(outcomes);
      const rate = t.card / t.total;
      console.log(
        `[MUST_PROPOSE] ${gc.id}: card ${t.card}/${t.total} (${(rate * 100).toFixed(0)}%) ` +
          `— complete ${t.complete}, partial(draft) ${t.partial}, wrong-tool ${t.wrongTool}, no-tool ${t.noTool}` +
          (reads.length ? ` | reads: ${[...new Set(reads)].join(",")}` : "") +
          (gc.baseline ? ` | baseline: ${gc.baseline}` : ""),
      );
      if (declines.length) console.log(`[MUST_PROPOSE] ${gc.id}: DECLINED SAYING → ${JSON.stringify(declines[0])}`);

      // 1. A card must reach the screen. This is the user's actual complaint.
      //    A declared knownGap is measured and reported but not asserted — see the field's docs.
      if (gc.knownGap) {
        console.log(`[MUST_PROPOSE] ${gc.id}: KNOWN GAP, not asserted — ${gc.knownGap}`);
      } else {
        expect(
          rate,
          `${gc.id}: card rate ${t.card}/${t.total} below ${CARD_RATE_THRESHOLD}. ${gc.note}`,
        ).toBeGreaterThanOrEqual(CARD_RATE_THRESHOLD);
      }

      // 2. Asserted SEPARATELY (council S4): a bare "some tool was called" passes on the wrong tool,
      //    which would be a write the user never asked for.
      //    Skipped for a declared knownGap — otherwise a case we have already documented as not-yet-working
      //    still turns the nightly red, which is how a scheduled eval trains people to ignore it. The gap
      //    is measured and printed above either way.
      if (!gc.knownGap) {
        expect(t.wrongTool, `${gc.id}: called the wrong tool ${t.wrongTool}/${t.total} times`).toBe(0);
      }

      // 3. NEVER fabricate. This is why forced tool_choice was rejected: a required-but-unknown field
      //    must be omitted, not guessed. One occurrence fails the case outright.
      expect(fabrications, `${gc.id}: model invented values it could not know: ${fabrications.join(", ")}`).toEqual([]);
    },
    RUNS * MAX_EVAL_TURNS * 60_000,
  );

  it.each(MUST_NOT_PROPOSE_GOLDEN)(
    "$id (read control): $utterance",
    async (gc) => {
      // The write verbs in this domain ARE the query verbs. A write proposal here is worse than no
      // card — it is an operation the user never requested (council C5).
      const offenders: string[] = [];
      for (let i = 0; i < RUNS; i++) {
        const { writeCalls } = await runExchange(gc);
        offenders.push(...writeCalls.map((c) => c.name ?? ""));
      }
      console.log(`[MUST_NOT_PROPOSE] ${gc.id}: write calls ${offenders.length}/${RUNS}`);
      expect(offenders, `${gc.id}: proposed a WRITE for a read question. ${gc.note}`).toEqual([]);
    },
    RUNS * MAX_EVAL_TURNS * 60_000,
  );
});

// The non-LLM half runs everywhere, including CI with no key — a golden that names a tool the registry
// no longer has, or an arg key the schema rejects, is a silent eval that proves nothing.
describe("MUST_PROPOSE goldens are structurally valid", () => {
  const byName = new Map(TOOLS.map((t) => [t.name, t]));

  it.each(MUST_PROPOSE_GOLDEN)("$id names a real tool with real arg keys", (gc) => {
    const tool = byName.get(gc.tool);
    expect(tool, `unknown tool "${gc.tool}"`).toBeDefined();
    const props = Object.keys((tool!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
    for (const key of [...gc.readyRequires, ...(gc.unknowable ?? [])]) {
      expect(props, `${gc.id}: "${key}" is not in ${gc.tool}'s inputSchema`).toContain(key);
    }
  });

  it("every knownGap states a reason (a bare skip is how a bug becomes permanent)", () => {
    for (const gc of MUST_PROPOSE_GOLDEN) {
      if (gc.knownGap !== undefined) expect(gc.knownGap.length, `${gc.id}: empty knownGap`).toBeGreaterThan(20);
    }
  });

  it("the seeded repro is NOT a knownGap — it is the case this plan had to fix", () => {
    expect(MUST_PROPOSE_GOLDEN.find((g) => g.id === "wo-rack-assignee-unknown")?.knownGap).toBeUndefined();
  });

  it("covers the exact reproduced utterance, with its measured baseline recorded", () => {
    const repro = MUST_PROPOSE_GOLDEN.find((g) => g.id === "wo-rack-assignee-unknown");
    expect(repro).toBeDefined();
    expect(repro!.utterance).toContain("rack all the wine from T3 to T4");
    expect(repro!.baseline).toContain("2/7");
  });

  it("declares no `unknowable` field that is also required by the tool schema", () => {
    // If a field the model cannot know were REQUIRED, the model would have to fabricate it to call the
    // tool at all — the guarantee the Draft architecture exists to avoid.
    for (const gc of MUST_PROPOSE_GOLDEN) {
      const schema = byName.get(gc.tool)!.inputSchema as { required?: string[] };
      for (const key of gc.unknowable ?? []) {
        expect(schema.required ?? [], `${gc.id}: "${key}" is unknowable but REQUIRED by ${gc.tool}`).not.toContain(key);
      }
    }
  });
});
