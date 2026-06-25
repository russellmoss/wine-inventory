import { describe, it, expect } from "vitest";
import { SentenceChunker } from "@/lib/voice/sentence-chunker";

// Feed deltas the way a token stream arrives (split at awkward points) and assert
// the chunker only emits whole sentences.

function feed(deltas: string[]): { emitted: string[]; tail: string | null } {
  const c = new SentenceChunker();
  const emitted: string[] = [];
  for (const d of deltas) emitted.push(...c.push(d));
  return { emitted, tail: c.flush() };
}

describe("SentenceChunker", () => {
  it("emits a sentence once a boundary + space arrives", () => {
    const { emitted, tail } = feed(["Hello there. ", "How are you? "]);
    expect(emitted).toEqual(["Hello there.", "How are you?"]);
    expect(tail).toBeNull();
  });

  it("holds the last sentence with no trailing space until flush", () => {
    const { emitted, tail } = feed(["The reading is ready"]);
    expect(emitted).toEqual([]);
    expect(tail).toBe("The reading is ready");
  });

  it("does not split inside a decimal number", () => {
    const { emitted, tail } = feed(["Block 3 hit 24.5 Brix today. ", "Nice."]);
    expect(emitted).toEqual(["Block 3 hit 24.5 Brix today."]);
    expect(tail).toBe("Nice.");
  });

  it("does not split on common abbreviations", () => {
    const { emitted } = feed(["Dr. Smith and Mr. Jones agree. ", "Done. "]);
    expect(emitted).toEqual(["Dr. Smith and Mr. Jones agree.", "Done."]);
  });

  it("handles a boundary split across two deltas", () => {
    const { emitted, tail } = feed(["First sentence", ". ", "Second."]);
    expect(emitted).toEqual(["First sentence."]);
    expect(tail).toBe("Second.");
  });

  it("waits when the terminator is the very last char (could be a decimal)", () => {
    const c = new SentenceChunker();
    expect(c.push("Value is 3")).toEqual([]); // no terminator
    expect(c.push(".")).toEqual([]); // terminator at end of buffer -> wait
    expect(c.push("5 more. ")).toEqual(["Value is 3.5 more."]);
  });

  it("groups multiple terminators and closing quotes", () => {
    const { emitted } = feed(['He said "go!" ', "Really?! "]);
    expect(emitted).toEqual(['He said "go!"', "Really?!"]);
  });

  it("returns null tail when buffer is empty or whitespace", () => {
    const c = new SentenceChunker();
    c.push("All done. ");
    expect(c.flush()).toBeNull();
  });

  it("emits several sentences from a single large delta", () => {
    const { emitted, tail } = feed(["One. Two! Three? Four"]);
    expect(emitted).toEqual(["One.", "Two!", "Three?"]);
    expect(tail).toBe("Four");
  });
});
