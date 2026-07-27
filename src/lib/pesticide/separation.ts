/**
 * Spray Intelligence S2b Unit 3 — separation-rule evaluation (KD-2).
 *
 * PURE (rule §3.13): no Prisma, no React, no fetch. Given two products' own asserted rule sets,
 * which one was applied first, the elapsed days between them, and whether fruit is present, this
 * returns EVIDENCE — the most restrictive applicable rule and everything that produced it — never a
 * verdict. Deciding what to DO with that evidence (block, warn, or ignore) belongs to S7b, which has
 * the legal and scheduling context this module deliberately does not.
 *
 * Two failure modes this module exists to prevent:
 *  1. Inheriting one product's rules onto a category ("oil"). Compatibility is keyed by
 *     `subjectEpaRegNumber` and asserted per-product; a second oil with no matching rule of its own
 *     produces NO_RESTRICTION, never JMS's 10-day rule.
 *  2. A CLASS-targeted rule silently failing to match and reading as "no restriction" (council G5).
 *     If the candidate's own `agronomicClass` tags are empty — not yet curated — a CLASS rule
 *     against it is NO_EVIDENCE, a status distinguishable from a confirmed NO_RESTRICTION.
 */

import type {
  SeparationEvidence,
  SeparationEvidenceStatus,
  SeparationProductProfile,
  SeparationQuery,
  SeparationRuleRow,
} from "./types";

type MatchResult = "MATCH" | "NO_MATCH" | "AMBIGUOUS";

function matchesTarget(rule: SeparationRuleRow, candidate: SeparationProductProfile): MatchResult {
  switch (rule.targetKind) {
    case "PRODUCT":
      return rule.targetKey === candidate.epaRegNumber ? "MATCH" : "NO_MATCH";
    case "ACTIVE_INGREDIENT":
      return candidate.activeIngredientKeys.includes(rule.targetKey) ? "MATCH" : "NO_MATCH";
    case "AGRONOMIC_CLASS":
      if (candidate.agronomicClass.includes(rule.targetKey)) return "MATCH";
      // An unclassified candidate (no tags at all) can neither confirm nor deny membership — that
      // is NO_EVIDENCE, not NO_MATCH. A candidate classified into OTHER tags is a confident NO_MATCH.
      return candidate.agronomicClass.length === 0 ? "AMBIGUOUS" : "NO_MATCH";
  }
}

function fruitGateAllows(rule: SeparationRuleRow, fruitPresent: boolean): boolean {
  return !rule.fruitPresentOnly || fruitPresent;
}

/** Candidate rules from `subject`'s own label, evaluated against `target`, filtered to the one
 * direction that constrains "target applied `elapsedDays` after subject". */
function candidatesFrom(
  subject: SeparationProductProfile,
  target: SeparationProductProfile,
  direction: SeparationRuleRow["direction"],
  fruitPresent: boolean,
): { matched: SeparationRuleRow[]; ambiguous: SeparationRuleRow[] } {
  const matched: SeparationRuleRow[] = [];
  const ambiguous: SeparationRuleRow[] = [];
  for (const rule of subject.rules) {
    if (rule.direction !== direction) continue;
    if (!fruitGateAllows(rule, fruitPresent)) continue;
    const result = matchesTarget(rule, target);
    if (result === "MATCH") matched.push(rule);
    else if (result === "AMBIGUOUS") ambiguous.push(rule);
  }
  return { matched, ambiguous };
}

const EMPTY_EVIDENCE = (status: SeparationEvidenceStatus, elapsedDays: number, hasUnresolvedAmbiguity = false): SeparationEvidence => ({
  status,
  minDays: null,
  elapsedDays,
  belowMinimum: false,
  producingRules: [],
  condition: null,
  hasUnresolvedAmbiguity,
});

/**
 * Evaluate the separation constraint for `later` applied `elapsedDays` after `earlier`.
 *
 * Both directions are evaluated and unioned (KD-2 — "both labels' rules union in the relevant
 * direction; most restrictive wins"):
 *  - `earlier`'s own rules targeting `later`, direction TARGET_AFTER_SUBJECT
 *    ("target may not be applied within N days after the subject")
 *  - `later`'s own rules targeting `earlier`, direction TARGET_BEFORE_SUBJECT
 *    ("target may not be applied within N days before the subject")
 * These are two labels independently describing the same calendar relationship; neither implies
 * the other, and querying the reverse relationship (earlier applied after later) requires swapping
 * the arguments — it is not derived from this result.
 */
export function evaluateSeparation(query: SeparationQuery): SeparationEvidence {
  const { earlier, later, elapsedDays, fruitPresent } = query;

  const fromEarlier = candidatesFrom(earlier, later, "TARGET_AFTER_SUBJECT", fruitPresent);
  const fromLater = candidatesFrom(later, earlier, "TARGET_BEFORE_SUBJECT", fruitPresent);

  const matched = [...fromEarlier.matched, ...fromLater.matched];
  const ambiguous = [...fromEarlier.ambiguous, ...fromLater.ambiguous];

  if (matched.length > 0) {
    const minDays = Math.max(...matched.map((r) => r.minDays));
    const producingRules = matched.filter((r) => r.minDays === minDays);
    return {
      status: "RESTRICTION_FOUND",
      minDays,
      elapsedDays,
      belowMinimum: elapsedDays < minDays,
      producingRules,
      condition: producingRules.find((r) => r.condition != null)?.condition ?? null,
      // A confident match must never hide a DIFFERENT, unresolved CLASS rule that could be even
      // more restrictive — surfaced regardless of which branch produced the confident match.
      hasUnresolvedAmbiguity: ambiguous.length > 0,
    };
  }

  if (ambiguous.length > 0) {
    return EMPTY_EVIDENCE("NO_EVIDENCE", elapsedDays, true);
  }

  return EMPTY_EVIDENCE("NO_RESTRICTION", elapsedDays);
}
