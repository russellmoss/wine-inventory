/**
 * Plan 083 Unit 1 — SPIKE. Temporary; delete once the mechanism is chosen and Unit 2 lands.
 *
 * Picks the fix mechanism empirically against the live reproduction (feedback cmrsrs02) instead of
 * assuming one. PR #391 shipped on an unmeasured premise, and the "annotate the transcript" fix was
 * already measured dead (0/6, and the model echoed the marker into its reply). So: four arms, real
 * transcript, production model, real system prompt, no tool_choice.
 *
 *   A  baseline        — history exactly as replayed today (text only). Must reproduce ~0/N.
 *   B  blocks          — prior tool calls reconstructed as real tool_use/tool_result blocks.
 *   C  neutralized     — assistant card-claiming prose stripped from history, no blocks added.
 *   D  blocks + neutral— both.
 *
 * Arm A failing is the precondition. If it does not reproduce, the arms mean nothing and the spike
 * is invalid — say so rather than reporting the others.
 */
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { getToolsFor } from "@/lib/assistant/registry";

const FIXTURE = new URL("./fixtures/cmrsrs02-transcript.json", import.meta.url);
const RUNS = Number(process.env.RUNS || 8);
const MODEL = process.env.SPIKE_MODEL || "claude-opus-4-8";
const ENABLED = process.env.SPIKE === "1" && !!process.env.ANTHROPIC_API_KEY;

type Block = Record<string, unknown>;
type Msg = { role: "user" | "assistant"; content: string | Block[] };

/**
 * What each assistant turn in the transcript ACTUALLY did, reconstructed from the reply text.
 * Keyed by index into the filtered transcript. This is the evidence today's replay throws away —
 * `history.ts:16` keeps only string content, so none of this survives into the next request.
 */
const RECONSTRUCTED: Record<number, Array<{ name: string; input: Block; result: string }>> = {
  1: [{ name: "propose_work_order", input: { sourceText: "rack tank T3 to tank T4", assigneeEmail: "sarah@example.com" }, result: "Draft proposal emitted. Unresolved: assigneeEmail (no member matches sarah@example.com). Card is on screen." }],
  3: [{ name: "query_cellar_contents", input: { vesselType: "barrel" }, result: "B1 225/225 L; B2 225/225 L; B3 100/225 L (2025 Pinot Noir); B4 ~225/225 L (3 MUST lots); B5 228/228 L; B6 500/500 L." }],
  5: [{ name: "db_find", input: { entity: "VineyardBlock", query: "Block 1" }, result: "7 matches across vineyards (QBO Demo zhmfs, Ojai, Madera, Russian River, QBO Demo, QBO Demo pt0sk, Oakville Estate)." }],
  7: [{ name: "propose_work_order", input: { sourceText: "rack all wine from T3 to T4", assigneeEmail: "mike@demowinery.test" }, result: "Ready proposal emitted with 1 warning. Card is on screen awaiting confirmation." }],
  9: [{ name: "log_brix", input: { brixValue: 24.2, block: "Block 3" }, result: "Proposal emitted: Block 3 (Ojai) at 24.2 Bx. Card is on screen awaiting confirmation." }],
};

/** Sentences that model "a write happened, go look at the card". Mirrors overclaim-guard's CLAIMS. */
const CARD_CLAIM =
  /\b(review|confirm)\b[^.\n]{0,24}\bthe card\b|\bi(?:'ve| have)?\s+(?:logged|recorded|drafted|filed|created|queued|submitted)\b|\bis on screen\b|\bcard is (?:on screen|ready)\b/i;

function neutralize(text: string): string {
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !CARD_CLAIM.test(s))
    .join(" ")
    .trim();
  // Never hand back an empty assistant turn: that breaks alternation and is not a fair comparison.
  return kept || "Acknowledged.";
}

async function askOnce(system: string, tools: unknown[], messages: Msg[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, tools, messages }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as { content: Array<{ type: string; name?: string; text?: string }> };
  return {
    toolUse: data.content.filter((b) => b.type === "tool_use").map((b) => b.name as string),
    text: data.content.find((b) => b.type === "text")?.text ?? "",
  };
}

describe.skipIf(!ENABLED)("plan 083 U1 spike — which mechanism restores tool calling", () => {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as Array<{ role?: string; content?: unknown }>;
  const turns = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));
  const idx = turns.findIndex((m) => m.role === "user" && m.content.includes("rotten eggs"));
  const history = turns.slice(0, idx); // prior turns only
  const request = turns[idx];

  /** Arm A: what ships today. */
  function armBaseline(): Msg[] {
    return [...history, request];
  }

  /** Arm C: same shape, assistant card-claims removed. */
  function armNeutralized(): Msg[] {
    return [
      ...history.map((m) => (m.role === "assistant" ? { ...m, content: neutralize(m.content) } : m)),
      request,
    ];
  }

  /** Arms B / D: real tool_use + tool_result blocks around each assistant turn that used tools. */
  function armBlocks(neutral: boolean): Msg[] {
    const out: Msg[] = [];
    history.forEach((m, i) => {
      const calls = m.role === "assistant" ? RECONSTRUCTED[i] : undefined;
      const text = neutral && m.role === "assistant" ? neutralize(m.content) : m.content;
      if (!calls?.length) {
        out.push({ role: m.role, content: text });
        return;
      }
      const ids = calls.map((_, k) => `toolu_spike_${i}_${k}`);
      out.push({
        role: "assistant",
        content: calls.map((c, k) => ({ type: "tool_use", id: ids[k], name: c.name, input: c.input })),
      });
      out.push({
        role: "user",
        content: calls.map((c, k) => ({ type: "tool_result", tool_use_id: ids[k], content: c.result })),
      });
      out.push({ role: "assistant", content: text });
    });
    out.push(request);
    return out;
  }

  const system = buildSystemPrompt();
  const tools = getToolsFor({ role: "admin" } as never).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  async function measure(label: string, messages: Msg[]) {
    let anyTool = 0;
    let target = 0;
    const misses: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      const { toolUse, text } = await askOnce(system, tools, messages);
      if (toolUse.length) anyTool++;
      if (toolUse.includes("record_tasting_note")) target++;
      else misses.push(text.replace(/\s+/g, " ").slice(0, 130));
    }
    const rate = (target / RUNS).toFixed(2);
    console.log(`[SPIKE] ${label.padEnd(26)} anyTool ${anyTool}/${RUNS} | record_tasting_note ${target}/${RUNS} (${rate})`);
    if (misses.length) console.log(`         miss → "${misses[0]}"`);
    return target / RUNS;
  }

  it(
    "measures all four arms",
    async () => {
      console.log(`model=${MODEL} runs=${RUNS} tools=${tools.length} historyTurns=${history.length}`);
      const a = await measure("A baseline (today)", armBaseline());
      const b = await measure("B blocks", armBlocks(false));
      const c = await measure("C neutralized", armNeutralized());
      const d = await measure("D blocks+neutralized", armBlocks(true));

      console.log("\n[SPIKE] ── verdict ──");
      if (a > 0.25) {
        console.log(`[SPIKE] INVALID: arm A scored ${a.toFixed(2)}; the bug did not reproduce, so B/C/D prove nothing.`);
        return;
      }
      const ranked = [
        ["B blocks", b],
        ["C neutralized", c],
        ["D blocks+neutralized", d],
      ]
        .filter(([, v]) => (v as number) >= 0.9)
        .sort((x, y) => (y[1] as number) - (x[1] as number));
      console.log(
        ranked.length
          ? `[SPIKE] WINNER: ${ranked[0][0]} at ${(ranked[0][1] as number).toFixed(2)}. Clearing 0.9: ${ranked.map(([n]) => n).join(", ")}`
          : `[SPIKE] NO ARM CLEARS 0.9 (B=${b.toFixed(2)} C=${c.toFixed(2)} D=${d.toFixed(2)}) — escalate per plan 083 Unit 1.`,
      );
    },
    RUNS * 4 * 90_000,
  );
});
