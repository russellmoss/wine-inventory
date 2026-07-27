import { describe, it, expect } from "vitest";
import { searchKnowledgeBaseTool } from "@/lib/assistant/tools/search-knowledge-base";

/**
 * SKB Unit 3, layer 1 — a STRUCTURAL guard on the tool description.
 *
 * A prompt string is not a gate; that is what the handler classifier is for. But it is a real surface
 * and it can regress silently: the description is prose, it gets edited by whoever ships the next
 * assistant feature, and nothing else in the suite reads it. These assertions are the thing that
 * survives a well-meaning future prompt edit.
 *
 * The specific regression this exists to catch: before SKB the description advertised its own scope as
 * including "compliance", and none of its eight rules told the model to refuse a legality question.
 */

const D = searchKnowledgeBaseTool.description;

describe("search_knowledge_base description — the scope no longer claims compliance", () => {
  it("does not advertise 'compliance' as something this tool answers", () => {
    // Not a blanket ban on the word — the scope-limit sentence below has to be able to say what it
    // is NOT. What must not come back is the positive-scope list ending in ", compliance".
    expect(D).not.toMatch(/sensory,\s*disease\/pest\s*management,\s*compliance/);
    expect(D).not.toMatch(/management,\s*compliance\./);
  });

  it("carries an explicit scope limit naming the relational data it does NOT establish", () => {
    expect(D).toMatch(/SCOPE LIMIT/);
    expect(D).toMatch(/does NOT establish what is legally permitted/i);
    for (const term of ["registration", "REI", "PHI", "rotation clearance"]) {
      expect(D, `scope limit omits "${term}"`).toMatch(new RegExp(term.replace(/[()]/g, "\\$&"), "i"));
    }
  });

  it("states that a passage naming a product is not a clearance to apply it", () => {
    expect(D).toMatch(/not a clearance/i);
  });
});

describe("search_knowledge_base description — rule 9 is the mandatory handoff", () => {
  it("exists, and is built in rule 4's proven handoff shape", () => {
    expect(D).toMatch(/9\.\s*LEGALITY/);
    // Rule 4 ("do not do the math yourself, use calc_so2") is the construction that demonstrably
    // works. Rule 9 must point somewhere the same way, not merely disclaim.
    expect(D).toMatch(/answered by the relational registration data/i);
  });

  it("refuses the VERDICT and requires the context anyway — the reframing is the whole unit", () => {
    expect(D).toMatch(/REFUSE THE VERDICT, NOT THE QUESTION/);
    expect(D).toMatch(/STILL give the agronomic context/i);
    // Refusing outright is the failure mode this replaced: a grower mid-season does not wait, they
    // Google it or spray from memory.
    expect(D).toMatch(/leaves the grower worse off/i);
  });

  it("names the tier-B trap literally, because that sentence is the one that reads as permission", () => {
    expect(D).toMatch(/captan \(M4\)/i);
    expect(D).toMatch(/epidemiology, NOT a clearance/i);
  });
});

describe("search_knowledge_base description — rule 8's currency language is load-bearing and unchanged", () => {
  // The SKB plan is explicit that rule 8 stays verbatim. It is the only thing standing between a 2015
  // spray passage and a confident present-tense answer, and it is measured by its own golden eval.
  it("keeps the dateSource / ageYears staleness contract", () => {
    expect(D).toMatch(/8\.\s*CURRENCY\./);
    expect(D).toMatch(/`dateSource: 'last-modified'`/);
    expect(D).toMatch(/`ageYears` is a STALENESS signal only/);
    expect(D).toMatch(/Do NOT refuse to answer because a passage is old/);
    expect(D).toMatch(/current product label and their regulator \(TTB \/ state \/ local\)/);
  });

  it("keeps rules 1-7 intact", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(D, `rule ${n} is missing`).toMatch(new RegExp(`\\n${n}\\. `));
    }
  });
});

describe("search_knowledge_base — still a read tool", () => {
  it("is registered read-only", () => {
    expect(searchKnowledgeBaseTool.kind).toBe("read");
    expect(searchKnowledgeBaseTool.name).toBe("search_knowledge_base");
  });
});
