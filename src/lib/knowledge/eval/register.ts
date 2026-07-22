// Detects RETRIEVAL DISPLACEMENT: a new source quietly taking top-k slots away from the sources that
// were answering practical questions well.
//
// WHY THE EXISTING EVAL CANNOT DO THIS. scripts/verify-knowledge-base.ts scores RECALL — it passes when
// ONE expected document appears anywhere in top-k, and never inspects the other slots. Four ways that
// misses displacement:
//   1. `passages.find(...)` — one hit passes the case; the remaining 5 slots are unexamined.
//   2. `expectFact` matches a term ANYWHERE in the passage set, not in the passage that earned the slot.
//   3. Its documented protocol on failure is to WIDEN expectPaths ("retrieval got better, not worse").
//      Correct for a peer extension source; for a different-register source it rationalises the very
//      regression we are trying to catch.
//   4. Its only slot-composition assertion rewards MORE publishers (`publishers.size >= 2`), so a corpus
//      getting more scattered scores BETTER.
//
// WHY DISPLACEMENT IS THE RIGHT THING TO MEASURE, and not "register". Classifying a passage's register
// from its text is a heuristic that will be wrong at the edges and will rot. Which publisher won a slot
// is an OBJECTIVE fact. So this compares slot occupancy against a recorded baseline and reports what
// moved — no taxonomy, no text classification, nothing to argue with.
//
// WHY MMR MAKES THIS NECESSARY. retrieve.ts runs mmrSelect(..., 0.7), so 30% of the selection weight is
// DISSIMILARITY from what is already chosen. A source with a distinct register is structurally
// advantaged: it can win a slot precisely BECAUSE it does not resemble the practical content already
// selected. Corpus growth is therefore not register-neutral by default, and nothing else checks it.
//
// A FAILURE HERE IS NOT AUTOMATICALLY A BUG — it means a human must look at the diff. But unlike the
// recall eval, the correct default response is NOT to widen the expectation.

/** One question's top-k occupancy: the publisher that won each slot, in rank order. */
export interface SlotObservation {
  question: string;
  /** Publisher per slot, best-first. Length is topK (or fewer if retrieval returned fewer). */
  publishers: string[];
}

export interface RegisterBaseline {
  /** ISO timestamp — provenance only; comparison never depends on it. */
  capturedAt: string;
  topK: number;
  questions: SlotObservation[];
}

export interface QuestionDrift {
  question: string;
  baseline: string[];
  current: string[];
  /** Publishers that held slots in the baseline and hold fewer (or none) now. */
  lost: string[];
  /** Publishers holding slots now that held fewer (or none) before. */
  gained: string[];
  /** How many slots changed hands. Multiset-based, so pure re-RANKING among the same publishers is 0. */
  displaced: number;
  /** Slots won by publishers entirely absent from this question's baseline. */
  fromNewPublishers: number;
}

function toCounts(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

/**
 * Multiset difference, preserving repeats: how many slots `a` holds beyond what `b` holds.
 * Returns one entry per surplus slot, so ["AWRI","AWRI"] vs ["AWRI"] yields ["AWRI"].
 */
function surplus(a: string[], b: string[]): string[] {
  const bc = toCounts(b);
  const out: string[] = [];
  for (const [pub, n] of toCounts(a)) {
    const excess = n - (bc.get(pub) ?? 0);
    for (let i = 0; i < excess; i++) out.push(pub);
  }
  return out;
}

/**
 * Compare current occupancy to the baseline, per question.
 *
 * Deliberately MULTISET, not positional: a passage moving from slot 2 to slot 4 while the same
 * publishers hold the same number of slots is re-ranking, not displacement, and flagging it would
 * bury the real signal in noise.
 *
 * A question present in the baseline but missing from `current` is reported as fully displaced rather
 * than skipped — silently dropping a question is how a gate stops covering what it claims to cover.
 */
export function diffSlots(baseline: RegisterBaseline, current: SlotObservation[]): QuestionDrift[] {
  const byQuestion = new Map(current.map((c) => [c.question, c.publishers]));
  return baseline.questions.map((b) => {
    const cur = byQuestion.get(b.question) ?? [];
    const lost = surplus(b.publishers, cur);
    const gained = surplus(cur, b.publishers);
    const baselineSet = new Set(b.publishers);
    return {
      question: b.question,
      baseline: b.publishers,
      current: cur,
      lost,
      gained,
      displaced: lost.length,
      fromNewPublishers: cur.filter((p) => !baselineSet.has(p)).length,
    };
  });
}

export interface DriftThresholds {
  /** Max share of ONE question's slots that may change hands. Catches a narrow, deep regression. */
  maxPerQuestionDisplacedShare: number;
  /** Max share of ALL slots that may go to publishers absent from that question's baseline. */
  maxNewPublisherShare: number;
}

/** Deliberately strict — the point is to force a human look, not to auto-approve corpus growth. */
export const DEFAULT_THRESHOLDS: DriftThresholds = {
  maxPerQuestionDisplacedShare: 0.5,
  maxNewPublisherShare: 0.25,
};

export interface DriftVerdict {
  ok: boolean;
  /** Human-readable reasons the gate failed. Empty when ok. */
  reasons: string[];
  totalSlots: number;
  totalDisplaced: number;
  totalFromNewPublishers: number;
  newPublisherShare: number;
}

/**
 * Turn per-question drift into a pass/fail verdict.
 *
 * Two independent tripwires, because the failure modes have different shapes: a source can take a
 * couple of slots across MANY questions (broad dilution — caught by the aggregate share) or dominate a
 * FEW questions completely (narrow but severe — caught per question). Either alone misses the other.
 */
export function judgeDrift(
  drifts: QuestionDrift[],
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
): DriftVerdict {
  const reasons: string[] = [];
  let totalSlots = 0;
  let totalDisplaced = 0;
  let totalFromNewPublishers = 0;

  for (const d of drifts) {
    const slots = d.baseline.length;
    totalSlots += slots;
    totalDisplaced += d.displaced;
    totalFromNewPublishers += d.fromNewPublishers;
    if (slots === 0) continue;
    const share = d.displaced / slots;
    if (share > thresholds.maxPerQuestionDisplacedShare) {
      reasons.push(
        `"${d.question.slice(0, 60)}" — ${d.displaced}/${slots} slots changed hands ` +
          `(lost: ${d.lost.join(", ") || "none"}; gained: ${d.gained.join(", ") || "none"})`,
      );
    }
  }

  const newPublisherShare = totalSlots === 0 ? 0 : totalFromNewPublishers / totalSlots;
  if (newPublisherShare > thresholds.maxNewPublisherShare) {
    reasons.push(
      `new publishers took ${totalFromNewPublishers}/${totalSlots} slots ` +
        `(${Math.round(newPublisherShare * 100)}%, cap ${Math.round(thresholds.maxNewPublisherShare * 100)}%)`,
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    totalSlots,
    totalDisplaced,
    totalFromNewPublishers,
    newPublisherShare,
  };
}

/**
 * The practical-question set this gate is measured over.
 *
 * These are deliberately CELLAR-FLOOR questions — what a winemaker actually asks mid-vintage, phrased
 * the way they ask it. That is the register the assistant must not drift away from. They are NOT the
 * recall eval's questions: those were chosen to have a known correct document, which is a different
 * job. Add questions freely; changing or removing one invalidates the baseline for that question, so
 * re-capture rather than hand-editing the snapshot.
 */
export const PRACTICAL_QUERIES: readonly string[] = [
  "What is the most ideal YAN concentration for a white must?",
  "How do I get rid of Brett character in a red before bottling?",
  "How much SO2 should I add at crush?",
  "My ferment is stuck at 5 Brix — what do I do?",
  "When should I rack a red off gross lees?",
  "How do I cold stabilise a white wine?",
  "What causes hydrogen sulfide in ferment and how do I fix it?",
  "How do I sanitise barrels before filling?",
  "What TA and pH should I target for a Riesling?",
  "How do I do a bench trial for fining with bentonite?",
  "When is the right time to pick based on numbers?",
  "How do I manage a stuck malolactic fermentation?",
  "What is the correct dose of DAP for a nitrogen-deficient must?",
  "How do I prevent oxidation during pressing?",
  "What temperature should I ferment a Pinot Noir at?",
  "How do I test for protein stability?",
  "What do I do about volatile acidity in a barrel?",
  "How long should I age a red on oak?",
  "How do I control powdery mildew in the vineyard?",
  "What is the right time to apply a pre-infection fungicide for downy mildew?",
];
