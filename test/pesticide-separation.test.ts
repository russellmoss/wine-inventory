import { describe, it, expect } from "vitest";
import { evaluateSeparation } from "@/lib/pesticide/separation";
import { worstCaseReiHours } from "@/lib/pesticide/product-facts";
import type { SeparationProductProfile, SeparationRuleRow } from "@/lib/pesticide/types";

/**
 * Fixtures below are synthetic test data shaped after the discovery brief's own worked example
 * (spray-decision-discovery-brief.md §8.2, "JMS Stylet-Oil as the worked example") — NOT curated
 * production content. Reg numbers are fictional (`TEST-*`) on purpose: this module is pure and
 * never touches the real curated `pesticide_product_facts` table.
 */

function product(
  epaRegNumber: string,
  opts?: { activeIngredientKeys?: string[]; agronomicClass?: string[]; rules?: SeparationRuleRow[] },
): SeparationProductProfile {
  return {
    epaRegNumber,
    activeIngredientKeys: opts?.activeIngredientKeys ?? [],
    agronomicClass: opts?.agronomicClass ?? [],
    rules: opts?.rules ?? [],
  };
}

function rule(overrides: Partial<SeparationRuleRow> & Pick<SeparationRuleRow, "subjectEpaRegNumber" | "targetKind" | "targetKey" | "direction" | "minDays">): SeparationRuleRow {
  return { fruitPresentOnly: false, condition: null, ...overrides };
}

const JMS_OIL = "TEST-JMS-OIL";
const GENERIC_OIL = "TEST-GENERIC-OIL";
const GENERIC_SULFUR = "TEST-GENERIC-SULFUR";
const GENERIC_CAPTAN = "TEST-GENERIC-CAPTAN";

// JMS Stylet-Oil's own label: "do not apply sulfur within 10 days after an oil application"
// (brief §8.2), plus its own oil↔captan prohibition, asserted by AGRONOMIC_CLASS.
const jmsStyletOil = product(JMS_OIL, {
  agronomicClass: ["Horticultural Oil"],
  rules: [
    rule({
      subjectEpaRegNumber: JMS_OIL,
      targetKind: "AGRONOMIC_CLASS",
      targetKey: "Sulfur",
      direction: "TARGET_AFTER_SUBJECT",
      minDays: 10,
      condition: "do not apply sulfur within 10 days after an oil application",
    }),
    rule({
      subjectEpaRegNumber: JMS_OIL,
      targetKind: "AGRONOMIC_CLASS",
      targetKey: "Captan",
      direction: "TARGET_AFTER_SUBJECT",
      minDays: 10,
      condition: "do not tank-mix or sequence with Captan",
    }),
  ],
});

const genericSulfur = product(GENERIC_SULFUR, { agronomicClass: ["Sulfur"] });
const genericCaptan = product(GENERIC_CAPTAN, { agronomicClass: ["Captan"] });

describe("evaluateSeparation — JMS Stylet-Oil worked example (brief §8.2)", () => {
  it("oil then sulfur 6 days later: RESTRICTION_FOUND, below the 10-day minimum", () => {
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: genericSulfur,
      elapsedDays: 6,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("RESTRICTION_FOUND");
    expect(evidence.minDays).toBe(10);
    expect(evidence.belowMinimum).toBe(true);
    expect(evidence.producingRules).toHaveLength(1);
    expect(evidence.condition).toBe("do not apply sulfur within 10 days after an oil application");
  });

  it("oil then sulfur 12 days later: RESTRICTION_FOUND but not below the minimum", () => {
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: genericSulfur,
      elapsedDays: 12,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("RESTRICTION_FOUND");
    expect(evidence.belowMinimum).toBe(false);
  });

  it("the reverse is NOT implied — sulfur applied first, then oil, has no rule from either label", () => {
    // genericSulfur asserts nothing (fixture has no `rules`); JMS's rule only fires in the
    // TARGET_AFTER_SUBJECT direction with JMS as subject, which does not apply when JMS is `later`.
    const evidence = evaluateSeparation({
      earlier: genericSulfur,
      later: jmsStyletOil,
      elapsedDays: 2,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("NO_RESTRICTION");
  });

  it("a second, different oil with no rules of its own does not inherit JMS's rules", () => {
    const plainOil = product(GENERIC_OIL, { agronomicClass: ["Horticultural Oil"] }); // no `rules`
    const evidence = evaluateSeparation({
      earlier: plainOil,
      later: genericSulfur,
      elapsedDays: 1,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("NO_RESTRICTION");
  });

  it("oil↔captan fires in both directions", () => {
    const oilFirst = evaluateSeparation({
      earlier: jmsStyletOil,
      later: genericCaptan,
      elapsedDays: 3,
      fruitPresent: false,
    });
    expect(oilFirst.status).toBe("RESTRICTION_FOUND");
    expect(oilFirst.belowMinimum).toBe(true);

    // Captan's OWN label also prohibits sequencing with oil — an independent assertion for the
    // captan-then-oil direction (subject=Captan, target=Oil, TARGET_AFTER_SUBJECT), not the reverse
    // of JMS's rule above.
    const captanWithReturnRule = product(GENERIC_CAPTAN, {
      agronomicClass: ["Captan"],
      rules: [
        rule({
          subjectEpaRegNumber: GENERIC_CAPTAN,
          targetKind: "AGRONOMIC_CLASS",
          targetKey: "Horticultural Oil",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 14,
          condition: "do not apply an oil within 14 days after this application",
        }),
      ],
    });
    const captanFirst = evaluateSeparation({
      earlier: genericCaptan,
      later: jmsStyletOil,
      elapsedDays: 5,
      fruitPresent: false,
    });
    // Plain captan (no rules of its own) asserts nothing back at oil — captan-then-oil is NO_RESTRICTION
    // unless captan's own label asserts one, proving the direction is genuinely independent.
    expect(captanFirst.status).toBe("NO_RESTRICTION");

    const captanFirstWithRule = evaluateSeparation({
      earlier: captanWithReturnRule,
      later: jmsStyletOil,
      elapsedDays: 5,
      fruitPresent: false,
    });
    expect(captanFirstWithRule.status).toBe("RESTRICTION_FOUND");
    expect(captanFirstWithRule.minDays).toBe(14);
  });

  it("most-restrictive wins when both labels assert a rule for the same pairing", () => {
    const strictSulfur = product(GENERIC_SULFUR, {
      agronomicClass: ["Sulfur"],
      rules: [
        rule({
          subjectEpaRegNumber: GENERIC_SULFUR,
          targetKind: "AGRONOMIC_CLASS",
          targetKey: "Horticultural Oil",
          direction: "TARGET_BEFORE_SUBJECT",
          minDays: 21, // stricter than JMS's own 10-day rule
          condition: "wait 21 days after any oil application",
        }),
      ],
    });
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: strictSulfur,
      elapsedDays: 15,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("RESTRICTION_FOUND");
    expect(evidence.minDays).toBe(21); // the stricter of the two (10 vs 21) wins
    expect(evidence.belowMinimum).toBe(true);
  });

  it("fruitPresentOnly rules are excluded when fruit is not present", () => {
    const fruitGated = product(JMS_OIL, {
      agronomicClass: ["Horticultural Oil"],
      rules: [
        rule({
          subjectEpaRegNumber: JMS_OIL,
          targetKind: "AGRONOMIC_CLASS",
          targetKey: "Copper",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 10,
          fruitPresentOnly: true,
        }),
      ],
    });
    const copper = product("TEST-COPPER", { agronomicClass: ["Copper"] });

    const noFruit = evaluateSeparation({ earlier: fruitGated, later: copper, elapsedDays: 1, fruitPresent: false });
    expect(noFruit.status).toBe("NO_RESTRICTION");

    const withFruit = evaluateSeparation({ earlier: fruitGated, later: copper, elapsedDays: 1, fruitPresent: true });
    expect(withFruit.status).toBe("RESTRICTION_FOUND");
  });
});

describe("evaluateSeparation — CLASS-target ambiguity (council G5, KD-14)", () => {
  it("a CLASS target matching an UNCLASSIFIED product returns NO_EVIDENCE, never NO_RESTRICTION", () => {
    const unclassified = product("TEST-UNCLASSIFIED"); // agronomicClass: [] — not yet curated
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: unclassified,
      elapsedDays: 1,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("NO_EVIDENCE");
    expect(evidence.minDays).toBeNull();
  });

  it("a product positively classified into an UNRELATED class is a confident NO_RESTRICTION, not ambiguous", () => {
    const fungicide = product("TEST-FUNGICIDE", { agronomicClass: ["Fixed Copper"] });
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: fungicide,
      elapsedDays: 1,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("NO_RESTRICTION");
  });

  it("a product with no rules and no class ambiguity anywhere is NO_RESTRICTION", () => {
    const a = product("TEST-A", { agronomicClass: ["Neither"] });
    const b = product("TEST-B", { agronomicClass: ["Nor This"] });
    const evidence = evaluateSeparation({ earlier: a, later: b, elapsedDays: 30, fruitPresent: false });
    expect(evidence.status).toBe("NO_RESTRICTION");
  });

  it("hasUnresolvedAmbiguity is false when nothing is ambiguous", () => {
    const evidence = evaluateSeparation({
      earlier: jmsStyletOil,
      later: genericSulfur,
      elapsedDays: 6,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("RESTRICTION_FOUND");
    expect(evidence.hasUnresolvedAmbiguity).toBe(false);
  });

  it("a CONFIDENT match must never hide a DIFFERENT unresolved CLASS rule that could be even stricter (adversarial review finding)", () => {
    // The subject asserts two independent rules against the same target: a confident PRODUCT-kind
    // match (10 days) AND a CLASS-kind rule (21 days, stricter) the target isn't classified for yet.
    // Before this fix, evaluateSeparation returned RESTRICTION_FOUND/10 and silently discarded the
    // fact that a possibly-stricter rule existed but couldn't be confirmed — exactly the
    // gap-renders-as-an-answer failure council G5/KD-14 exist to prevent.
    const unclassifiedTarget = product("TEST-MIXED-TARGET");
    const subjectWithBothRuleKinds = product("TEST-MIXED-SUBJECT", {
      rules: [
        rule({
          subjectEpaRegNumber: "TEST-MIXED-SUBJECT",
          targetKind: "PRODUCT",
          targetKey: "TEST-MIXED-TARGET",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 10,
        }),
        rule({
          subjectEpaRegNumber: "TEST-MIXED-SUBJECT",
          targetKind: "AGRONOMIC_CLASS",
          targetKey: "Some Unassessed Class",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 21,
        }),
      ],
    });
    const evidence = evaluateSeparation({
      earlier: subjectWithBothRuleKinds,
      later: unclassifiedTarget,
      elapsedDays: 15,
      fruitPresent: false,
    });
    expect(evidence.status).toBe("RESTRICTION_FOUND");
    expect(evidence.minDays).toBe(10); // the confident match still wins the confirmed minDays…
    expect(evidence.hasUnresolvedAmbiguity).toBe(true); // …but the caller is told a stricter rule may exist
  });

  it("hasUnresolvedAmbiguity is true on a pure NO_EVIDENCE result too", () => {
    const unclassified = product("TEST-UNCLASSIFIED-2");
    const evidence = evaluateSeparation({ earlier: jmsStyletOil, later: unclassified, elapsedDays: 1, fruitPresent: false });
    expect(evidence.status).toBe("NO_EVIDENCE");
    expect(evidence.hasUnresolvedAmbiguity).toBe(true);
  });
});

describe("evaluateSeparation — PRODUCT and ACTIVE_INGREDIENT target kinds", () => {
  it("a PRODUCT-kind rule matches only the named EPA registration number", () => {
    const namesOtherProduct = product("TEST-SUBJECT", {
      rules: [
        rule({
          subjectEpaRegNumber: "TEST-SUBJECT",
          targetKind: "PRODUCT",
          targetKey: "TEST-NAMED-TARGET",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 7,
        }),
      ],
    });
    const namedTarget = product("TEST-NAMED-TARGET");
    const otherTarget = product("TEST-OTHER");

    expect(
      evaluateSeparation({ earlier: namesOtherProduct, later: namedTarget, elapsedDays: 1, fruitPresent: false })
        .status,
    ).toBe("RESTRICTION_FOUND");
    expect(
      evaluateSeparation({ earlier: namesOtherProduct, later: otherTarget, elapsedDays: 1, fruitPresent: false })
        .status,
    ).toBe("NO_RESTRICTION");
  });

  it("an ACTIVE_INGREDIENT-kind rule matches by AI key, not by product identity", () => {
    const targetsAi = product("TEST-SUBJECT-2", {
      rules: [
        rule({
          subjectEpaRegNumber: "TEST-SUBJECT-2",
          targetKind: "ACTIVE_INGREDIENT",
          targetKey: "MANCOZEB",
          direction: "TARGET_AFTER_SUBJECT",
          minDays: 5,
        }),
      ],
    });
    const carriesAi = product("TEST-CARRIER", { activeIngredientKeys: ["MANCOZEB"] });
    const doesNotCarryAi = product("TEST-NON-CARRIER", { activeIngredientKeys: ["CAPTAN"] });

    expect(
      evaluateSeparation({ earlier: targetsAi, later: carriesAi, elapsedDays: 1, fruitPresent: false }).status,
    ).toBe("RESTRICTION_FOUND");
    expect(
      evaluateSeparation({ earlier: targetsAi, later: doesNotCarryAi, elapsedDays: 1, fruitPresent: false }).status,
    ).toBe("NO_RESTRICTION");
  });
});

describe("REI worst-case bound (KD-12) — never mistaken for the scouting value", () => {
  it("a 12-hour scouting entry never masks a 48-hour hand-labor entry", () => {
    const hours = worstCaseReiHours({
      worstCaseReiHours: null,
      reiConditions: [
        { activity: "SCOUTING", hours: 12 },
        { activity: "HAND_LABOR", hours: 48 },
      ],
    });
    expect(hours).toBe(48);
  });

  it("falls back to the scalar bound only when there are no per-activity conditions", () => {
    const hours = worstCaseReiHours({ worstCaseReiHours: 24, reiConditions: [] });
    expect(hours).toBe(24);
  });
});
