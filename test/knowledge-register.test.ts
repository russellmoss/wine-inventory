import { describe, it, expect } from "vitest";
import {
  diffSlots,
  judgeDrift,
  DEFAULT_THRESHOLDS,
  PRACTICAL_QUERIES,
  type RegisterBaseline,
} from "@/lib/knowledge/eval/register";

const baseline = (questions: { question: string; publishers: string[] }[]): RegisterBaseline => ({
  capturedAt: "2026-07-22T00:00:00.000Z",
  topK: 6,
  questions,
});

describe("diffSlots", () => {
  it("reports zero displacement when the same publishers hold the same slots", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "AWRI", "WSU"] }]);
    const [d] = diffSlots(b, [{ question: "q1", publishers: ["AWRI", "AWRI", "WSU"] }]);
    expect(d.displaced).toBe(0);
    expect(d.lost).toEqual([]);
    expect(d.gained).toEqual([]);
  });

  // The whole reason this is multiset rather than positional: a passage sliding from slot 2 to slot 3
  // is re-ranking, not a register regression. Flagging it would bury the real signal in noise.
  it("ignores pure re-ranking among the same publishers", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "WSU", "AWRI"] }]);
    const [d] = diffSlots(b, [{ question: "q1", publishers: ["WSU", "AWRI", "AWRI"] }]);
    expect(d.displaced).toBe(0);
  });

  it("counts repeats — losing one of two AWRI slots is one displacement, not zero", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "AWRI", "WSU"] }]);
    const [d] = diffSlots(b, [{ question: "q1", publishers: ["AWRI", "IVES", "WSU"] }]);
    expect(d.displaced).toBe(1);
    expect(d.lost).toEqual(["AWRI"]);
    expect(d.gained).toEqual(["IVES"]);
    expect(d.fromNewPublishers).toBe(1);
  });

  it("counts every slot won by a publisher absent from the baseline", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "AWRI", "WSU"] }]);
    const [d] = diffSlots(b, [{ question: "q1", publishers: ["IVES", "IVES", "IVES"] }]);
    expect(d.fromNewPublishers).toBe(3);
    expect(d.displaced).toBe(3);
  });

  // A question vanishing from the run must never read as "nothing changed" — that is how a gate stops
  // covering what it claims to cover while still printing green.
  it("treats a question missing from the current run as fully displaced", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "WSU"] }]);
    const [d] = diffSlots(b, []);
    expect(d.current).toEqual([]);
    expect(d.displaced).toBe(2);
    expect(d.lost).toEqual(["AWRI", "WSU"]);
  });
});

describe("judgeDrift", () => {
  it("passes when nothing moved", () => {
    const b = baseline([{ question: "q1", publishers: ["AWRI", "WSU", "AWRI"] }]);
    const v = judgeDrift(diffSlots(b, [{ question: "q1", publishers: ["AWRI", "WSU", "AWRI"] }]));
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.totalDisplaced).toBe(0);
  });

  // The narrow-but-severe shape: one question captured almost entirely. An aggregate-only gate would
  // dilute this away across a 20-question set.
  it("fails a single question losing more than half its slots", () => {
    const b = baseline([
      { question: "brett", publishers: ["AWRI", "AWRI", "WSU", "AWRI"] },
      { question: "yan", publishers: ["AWRI", "AWRI", "AWRI", "AWRI"] },
    ]);
    const v = judgeDrift(
      diffSlots(b, [
        { question: "brett", publishers: ["IVES", "IVES", "IVES", "AWRI"] },
        { question: "yan", publishers: ["AWRI", "AWRI", "AWRI", "AWRI"] },
      ]),
    );
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("brett"))).toBe(true);
    expect(v.reasons.some((r) => r.includes("yan"))).toBe(false);
  });

  // The broad-dilution shape: never enough to trip any single question, plenty in aggregate.
  it("fails broad dilution that no single question would catch", () => {
    const qs = Array.from({ length: 8 }, (_, i) => ({
      question: `q${i}`,
      publishers: ["AWRI", "AWRI", "WSU"],
    }));
    const v = judgeDrift(
      diffSlots(
        baseline(qs),
        qs.map((q) => ({ question: q.question, publishers: ["AWRI", "IVES", "WSU"] })),
      ),
    );
    // 1 of 3 slots per question = 33% displaced, under the 50% per-question bar...
    expect(v.reasons.every((r) => !r.includes("q0"))).toBe(true);
    // ...but 8/24 slots to a new publisher (33%) trips the aggregate tripwire.
    expect(v.ok).toBe(false);
    expect(v.newPublisherShare).toBeCloseTo(1 / 3, 5);
    expect(v.reasons.some((r) => r.includes("new publishers"))).toBe(true);
  });

  // Boundary, decided deliberately rather than left to whichever comparison got typed: the thresholds
  // are MAXIMA, so landing exactly on one passes and only exceeding it fails. Pinned because a silent
  // flip to >= would start failing runs that are within the stated budget, and a flip the other way on
  // the per-question bar would let a question lose exactly half its slots unnoticed.
  it("treats a threshold as a maximum — exactly at the cap passes", () => {
    const qs = Array.from({ length: 8 }, (_, i) => ({
      question: `q${i}`,
      publishers: ["AWRI", "AWRI", "WSU", "WSU"],
    }));
    const v = judgeDrift(
      diffSlots(
        baseline(qs),
        qs.map((q) => ({ question: q.question, publishers: ["AWRI", "IVES", "WSU", "WSU"] })),
      ),
    );
    expect(v.newPublisherShare).toBeCloseTo(DEFAULT_THRESHOLDS.maxNewPublisherShare, 5);
    expect(v.ok).toBe(true);
  });

  it("does not penalise churn between publishers already in the baseline", () => {
    // WSU taking a slot from AWRI is normal corpus movement between peer extension sources, not the
    // arrival of a different register. It counts as displacement but adds nothing to the new-publisher
    // share, so the aggregate tripwire stays quiet.
    const qs = Array.from({ length: 8 }, (_, i) => ({
      question: `q${i}`,
      publishers: ["AWRI", "AWRI", "WSU", "WSU"],
    }));
    const v = judgeDrift(
      diffSlots(
        baseline(qs),
        qs.map((q) => ({ question: q.question, publishers: ["AWRI", "WSU", "WSU", "WSU"] })),
      ),
    );
    expect(v.totalFromNewPublishers).toBe(0);
    expect(v.newPublisherShare).toBe(0);
    expect(v.ok).toBe(true);
  });

  it("reports an empty baseline as passing rather than dividing by zero", () => {
    const v = judgeDrift(diffSlots(baseline([]), []));
    expect(v.ok).toBe(true);
    expect(v.totalSlots).toBe(0);
    expect(v.newPublisherShare).toBe(0);
  });

  it("thresholds are strict enough to be worth having", () => {
    expect(DEFAULT_THRESHOLDS.maxPerQuestionDisplacedShare).toBeLessThanOrEqual(0.5);
    expect(DEFAULT_THRESHOLDS.maxNewPublisherShare).toBeLessThanOrEqual(0.25);
  });
});

describe("PRACTICAL_QUERIES", () => {
  it("covers a meaningful spread of cellar-floor topics", () => {
    expect(PRACTICAL_QUERIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PRACTICAL_QUERIES).size).toBe(PRACTICAL_QUERIES.length);
  });
});
