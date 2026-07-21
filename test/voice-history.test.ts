import { describe, expect, it } from "vitest";
import {
  appendTurn,
  appendTurns,
  trimHistory,
  MAX_VOICE_HISTORY,
  type VoiceHistoryTurn,
} from "@/lib/voice/history";

const u = (content: string): VoiceHistoryTurn => ({ role: "user", content });
const a = (content: string): VoiceHistoryTurn => ({ role: "assistant", content });

describe("voice session history", () => {
  it("appends a turn without mutating the input", () => {
    const before: VoiceHistoryTurn[] = [u("what is in T5")];
    const after = appendTurn(before, a("Six hundred litres of Syrah."));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[1]).toEqual({ role: "assistant", content: "Six hundred litres of Syrah." });
  });

  it("preserves order so a typed turn and its reply read as one exchange", () => {
    // The regression this module exists for: type "log 22.4 for Block 3", then SAY
    // "make it 23". The spoken turn only resolves "it" if the typed pair is in history,
    // in the right order, before it.
    let history: VoiceHistoryTurn[] = [];
    history = appendTurns(history, [u("log 22.4 Brix for Block 3"), a("Logged 22.4 Brix for Block 3.")]);
    history = appendTurn(history, u("make it 23"));
    expect(history.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(history[0].content).toContain("22.4");
  });

  it("drops empty and whitespace-only turns", () => {
    const base: VoiceHistoryTurn[] = [u("hello")];
    expect(appendTurn(base, u(""))).toHaveLength(1);
    expect(appendTurn(base, u("   \n  "))).toHaveLength(1);
    expect(appendTurns(base, [u(""), a("real")])).toHaveLength(2);
  });

  it("trims to the most recent max, keeping the newest", () => {
    const long = Array.from({ length: 45 }, (_, i) => u(`turn ${i}`));
    const trimmed = trimHistory(long, 40);
    expect(trimmed).toHaveLength(40);
    expect(trimmed[0].content).toBe("turn 5");
    expect(trimmed[39].content).toBe("turn 44");
  });

  it("trims on append so a long session cannot grow unbounded", () => {
    let history: VoiceHistoryTurn[] = Array.from({ length: MAX_VOICE_HISTORY }, (_, i) => u(`turn ${i}`));
    history = appendTurn(history, u("newest"));
    expect(history).toHaveLength(MAX_VOICE_HISTORY);
    expect(history[MAX_VOICE_HISTORY - 1].content).toBe("newest");
    expect(history[0].content).toBe("turn 1");
  });

  it("trims a multi-turn append exactly once, not per turn", () => {
    const history = appendTurns(
      Array.from({ length: MAX_VOICE_HISTORY }, (_, i) => u(`turn ${i}`)),
      [u("typed"), a("replied")],
    );
    expect(history).toHaveLength(MAX_VOICE_HISTORY);
    expect(history.slice(-2).map((t) => t.content)).toEqual(["typed", "replied"]);
  });

  it("handles a non-positive cap without throwing", () => {
    expect(trimHistory([u("a"), u("b")], 0)).toEqual([]);
    expect(trimHistory([u("a")], -1)).toEqual([]);
  });

  it("returns a copy when nothing is appended, so callers can always reassign", () => {
    const base: VoiceHistoryTurn[] = [u("hello")];
    const same = appendTurns(base, []);
    expect(same).toEqual(base);
    expect(same).not.toBe(base);
  });
});
