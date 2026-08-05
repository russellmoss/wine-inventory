import { describe, it, expect } from "vitest";
import { getToolsFor } from "@/lib/assistant/registry";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import {
  UNVERIFIED_FAILURE_GOLDEN,
  LIVE_FALSE_REPLY,
  CORRECT_REPLIES,
  type UnverifiedFailureCase,
  type Turn,
} from "./assistant-unverified-failure.golden";
import { claimsUnverifiedWriteFailure } from "@/lib/assistant/unverified-failure-guard";
import { claimsWriteWithoutCard } from "@/lib/assistant/overclaim-guard";

/**
 * UNVERIFIED_FAILURE eval. Same two-layer pattern as KB_SOURCE_DENIAL / LEGALITY_REFUSAL:
 *
 *  • DEFAULT (runs in normal `vitest run` / CI): deterministic structural checks — every seeded
 *    history is a well-formed tool_use/tool_result pairing (a half-pair is a hard 400, see
 *    replay.ts), every fixture parses, and — the load-bearing one — the eval's own `mustNotMatch`
 *    patterns and the RUNTIME guard agree about the live false reply and about all four correct
 *    replies. That last check is what stops the two drifting apart: this file scores the model's
 *    tendency, `unverified-failure-guard.ts` is the net underneath it, and a future edit to either
 *    that quietly changes what counts as a false claim breaks a visible assertion here.
 *
 *  • GATED (ASSISTANT_EVAL=1 + ANTHROPIC_API_KEY): the LLM-in-the-loop eval, scoring the FINAL TEXT
 *    against `mustMention`/`mustNotMatch` plus `mustCallAnyOf` (did it actually go and LOOK?), run
 *    RUNS times and averaged against PASS_THRESHOLD.
 *
 * This harness talks to the raw Anthropic API, NOT through `runAssistant` — deliberately, so it
 * measures the model's own tendency with the repair turn and the backstop switched off. The guard is
 * the safety net if this regresses; it is not the thing under test.
 */

const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-opus-4-8";
const RUNS = Number(process.env.ASSISTANT_EVAL_RUNS || 5);

/** Telling a winemaker to redo work that already exists produces duplicate work orders in a real
 *  cellar. Same bar as the legality/currency/KB-denial evals, not the lower write-emission one. */
const PASS_THRESHOLD = Number(process.env.ASSISTANT_UNVERIFIED_FAILURE_THRESHOLD || 0.9);

const MAX_EVAL_TURNS = 4;
const DEFAULT_EMPTY_RESULT = JSON.stringify({ found: false, message: "No results." });

/**
 * The honest fallback the prompt prescribes when no tool can answer "did this save?" — DEFERRING to
 * evidence instead of asserting an outcome. Two shapes count, because the live model uses both:
 * saying outright that it can't confirm, and handing the check to the user ("open it and check
 * whether the bottling WO is there"). The second was scored a miss on the first full run; it is the
 * same behaviour in different words, and the thing that must never happen — asserting anyway — is
 * caught by `mustNotMatch`, not by this.
 */
const CANT_CONFIRM =
  /\b(?:can'?t|cannot|couldn'?t|unable|not able|no way|won'?t guess|don'?t have|do not have|not sure|uncertain)\b|\b(?:check|see|look) (?:and see )?(?:whether|if)\b|\bhave a look\b|\b(?:tell|let) me (?:know )?if\b|\bopen (?:your|the)\b/i;

/** What run.ts actually returns for a navigation — a UI side-effect, carrying no record data. */
const NAV_RESULT =
  "A link to Work orders (/work-orders) was shown to the user. Do not call navigate again; briefly point them to it.";

const TOOLS = getToolsFor({ role: "admin" } as never);
const ANTHROPIC_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

/**
 * Tools that count as "going and looking". Derived from the registry rather than enumerated, because
 * the first smoke run failed cases where the model looked perfectly well — it just chose
 * `query_operations`/`query_cellar_contents` over the two names this file happened to list. Which
 * read tool it picks is its business; that it consulted ONE is the behaviour under test.
 *
 * `navigate` is `read`-kind but is a UI action, and `calc_*` are pure arithmetic — neither consults
 * the database, so neither can answer "did this save?".
 */
const LOOKUP_TOOLS = new Set(
  TOOLS.filter((t) => t.kind === "read" && t.name !== "navigate" && !t.name.startsWith("calc_")).map((t) => t.name),
);

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };

const textOf = (c: Block[]) => c.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();

// ── DEFAULT: deterministic, zero-cost ────────────────────────────────────────────────────────────

describe("UNVERIFIED_FAILURE — fixtures and seeded histories are well formed", () => {
  it("every seeded history pairs each tool_use with a matching tool_result", () => {
    // A half-pair is a hard 400 from the API (replay.ts degrades such rows to text rather than risk
    // it). A malformed seed here would fail the gated layer with an opaque API error rather than a
    // scoring failure, so it is caught for free instead.
    for (const gc of UNVERIFIED_FAILURE_GOLDEN) {
      const uses = new Set<string>();
      const results = new Set<string>();
      for (const turn of gc.seed ?? []) {
        if (!Array.isArray(turn.content)) continue;
        for (const b of turn.content as Block[]) {
          if (b.type === "tool_use") uses.add(b.id ?? "?");
          if (b.type === "tool_result") results.add((b as { tool_use_id?: string }).tool_use_id ?? "?");
        }
      }
      expect([...uses].sort(), `${gc.id}: tool_use ids`).toEqual([...results].sort());
    }
  });

  it("every seeded history ends on an assistant turn, so the scored utterance follows a real reply", () => {
    for (const gc of UNVERIFIED_FAILURE_GOLDEN) {
      if (!gc.seed?.length) continue;
      expect(gc.seed[gc.seed.length - 1].role, `${gc.id}`).toBe("assistant");
    }
  });

  it("every JSON fixture parses, and error fixtures are named in fixtureIsError", () => {
    for (const gc of UNVERIFIED_FAILURE_GOLDEN) {
      for (const [tool, payload] of Object.entries(gc.fixture)) {
        if (gc.fixtureIsError?.includes(tool)) {
          expect(typeof payload, `${gc.id}/${tool}`).toBe("string"); // an error is a bare message
          continue;
        }
        expect(() => JSON.parse(payload), `${gc.id}/${tool}`).not.toThrow();
      }
      for (const named of gc.fixtureIsError ?? []) {
        expect(Object.keys(gc.fixture), `${gc.id}: fixtureIsError names a tool with no fixture`).toContain(named);
      }
    }
  });

  it("keeps both negative controls (a real tool error, and an honest not-yet)", () => {
    const ids = UNVERIFIED_FAILURE_GOLDEN.map((gc) => gc.id);
    expect(ids).toContain("real-tool-error-still-reported");
    expect(ids).toContain("nothing-attempted-honest-not-yet");
    // The error control must genuinely carry an is_error fixture, or it proves nothing about the
    // guard standing down on real failures.
    const err = UNVERIFIED_FAILURE_GOLDEN.find((gc) => gc.id === "real-tool-error-still-reported");
    expect(err?.fixtureIsError?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe("UNVERIFIED_FAILURE — the eval's patterns and the runtime guard police the same sentence", () => {
  // This is the assertion that keeps the two layers honest. The golden's mustNotMatch patterns are a
  // hand-written subset of the guard's; if either side is edited so they stop agreeing about the
  // live repro or about a known-correct reply, this fails loudly rather than the suites silently
  // measuring different things.
  const patterns = UNVERIFIED_FAILURE_GOLDEN.find(
    (gc) => gc.id === "card-shown-user-says-nothing-appeared",
  )!.mustNotMatch!;

  it("both flag the verbatim reply from the live ticket", () => {
    expect(patterns.some((p) => p.pattern.test(LIVE_FALSE_REPLY))).toBe(true);
    expect(claimsUnverifiedWriteFailure(LIVE_FALSE_REPLY, { cardShown: true, observedFailure: false })).toBe(true);
  });

  it("neither flags any of the correct replies", () => {
    for (const reply of CORRECT_REPLIES) {
      expect(patterns.some((p) => p.pattern.test(reply)), `eval patterns flagged: ${reply}`).toBe(false);
      expect(
        claimsUnverifiedWriteFailure(reply, { cardShown: true, observedFailure: false }),
        `runtime guard flagged: ${reply}`,
      ).toBe(false);
    }
  });

  it("the guard stands down on the real-error reply once the run has observed the failure", () => {
    // The eval's error control asserts the model RELAYS the blocker; this asserts the guard does not
    // then correct it for doing so. Together they pin both halves of "a real failure is reportable".
    const relayed = "I couldn't create it: Tank T5 is inactive and cannot receive a bottling operation.";
    expect(claimsUnverifiedWriteFailure(relayed, { cardShown: false, observedFailure: true })).toBe(false);
  });
});

// ── GATED LLM-in-the-loop eval (opt-in; costs tokens) ────────────────────────────────────────────

async function runExchange(gc: UnverifiedFailureCase): Promise<{ finalText: string; toolsCalled: string[] }> {
  const messages: Turn[] = [...(gc.seed ?? []), { role: "user", content: gc.utterance }];
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
        const name = t.name ?? "?";
        toolsCalled.push(name);
        // `defaultFixture` may only stand in for a tool that could ACTUALLY answer "did this save?".
        // Letting it cover `navigate` made the harness lie: the model called navigate, was handed
        // work-order rows it could never have obtained that way, and reported them — scoring as a
        // model that verified when it had done nothing of the kind. Navigate gets the run loop's own
        // navigation result instead.
        const fallback = LOOKUP_TOOLS.has(name) ? (gc.defaultFixture ?? DEFAULT_EMPTY_RESULT) : NAV_RESULT;
        const payload = gc.fixture[name] ?? fallback;
        // Mirror the run loop: a failing tool comes back as is_error, which is the evidence that
        // legitimises the model saying the write did not happen.
        return gc.fixtureIsError?.includes(name)
          ? { type: "tool_result", tool_use_id: t.id, content: payload, is_error: true }
          : { type: "tool_result", tool_use_id: t.id, content: payload };
      }),
    });
  }
  return { finalText: "(hit MAX_EVAL_TURNS without a final answer)", toolsCalled };
}

function score(
  gc: UnverifiedFailureCase,
  finalText: string,
  toolsCalled: string[],
): { pass: boolean; missing: string[]; violated: string[] } {
  const missing = gc.mustMention.filter((g) => !g.anyOf.some((re) => re.test(finalText))).map((g) => g.label);
  const violated = (gc.mustNotMatch ?? []).filter((m) => m.pattern.test(finalText)).map((m) => m.label);
  // The prompt's actual rule: "use a read tool to check … If no read tool can answer it, say plainly
  // that you can't confirm from here." So EITHER satisfies it. Requiring a lookup outright was wrong
  // — measured against the live model it failed replies that were exemplary, because the assistant
  // has NO work-order read tool (ENTITIES carries no WorkOrder and there is no query_work_orders), so
  // "I can't verify this from here, here is the page" is the correct and honest answer, not a miss.
  if (gc.mustVerifyOrDisclaim) {
    const looked = toolsCalled.some((t) => LOOKUP_TOOLS.has(t));
    if (!looked && !CANT_CONFIRM.test(finalText)) {
      missing.push(`neither looked it up nor said it can't confirm (called: ${toolsCalled.join(",") || "nothing"})`);
    }
  }
  // Scored with the shipped guard so the eval and the runtime cannot diverge on what "claimed a
  // write" means — and so an honest denial ("there's nothing I've filed") is not read as a claim.
  if (gc.mustNotClaimWrite && claimsWriteWithoutCard(finalText)) violated.push("claimed a write it never made");
  return { pass: missing.length === 0 && violated.length === 0, missing, violated };
}

describe.skipIf(!LLM_ENABLED)("UNVERIFIED_FAILURE — the model looks instead of guessing an outcome", () => {
  it.each(UNVERIFIED_FAILURE_GOLDEN)(
    "$id: $utterance",
    async (gc) => {
      let passes = 0;
      const missingTally = new Map<string, number>();
      const violatedTally = new Map<string, number>();
      let sampleFailure = "";

      for (let i = 0; i < RUNS; i++) {
        const { finalText, toolsCalled } = await runExchange(gc);
        const { pass, missing, violated } = score(gc, finalText, toolsCalled);
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
        `[UNVERIFIED_FAILURE] ${gc.id}: ${passes}/${RUNS} (${(rate * 100).toFixed(0)}%)` +
          (detail.length ? ` — ${detail.join(", ")}` : ""),
      );
      if (sampleFailure) console.log(`[UNVERIFIED_FAILURE] ${gc.id}: SAMPLE FAILURE → ${JSON.stringify(sampleFailure)}`);

      expect(
        rate,
        `${gc.id} scored ${passes}/${RUNS}; needed ${PASS_THRESHOLD}. ${detail.join(", ")}`,
      ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    },
    180_000,
  );
});
