import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectIssueIntent,
  primaryActionLabel,
  issueOnConfirmFromArgs,
  hasIssueIntentContract,
} from "@/lib/assistant/issue-intent";

// Plan 105 U1. The default outcome of "Review & create" is a DRAFT work order
// (03-interaction-spec.md:179). An explicit issue verb in the USER's own words flips the card's
// primary action to "Review & issue". A false negative costs one press; a false positive puts
// unvetted work in front of a cellar hand — so every ambiguous case below must resolve to false.

describe("detectIssueIntent — explicit publish verbs", () => {
  it("fires on the winery term of art", () => {
    expect(detectIssueIntent("Issue a work order to Mike to rack T3 to T4")).toBe(true);
    expect(detectIssueIntent("issue it")).toBe(true);
    expect(detectIssueIntent("rack T12 to T15 and issue it to Sarah")).toBe(true);
    expect(detectIssueIntent("Please issue that work order")).toBe(true);
  });

  it("fires on the other ways a winemaker says the same thing", () => {
    expect(detectIssueIntent("top the Pinot barrels and put it on the floor")).toBe(true);
    expect(detectIssueIntent("get this onto the floor today")).toBe(true);
    expect(detectIssueIntent("dispatch that to the cellar crew")).toBe(true);
    expect(detectIssueIntent("release it to Mike")).toBe(true);
  });

  it("handles verb inflections", () => {
    expect(detectIssueIntent("issued to Mike please")).toBe(true);
    expect(detectIssueIntent("start issuing that one")).toBe(true);
    expect(detectIssueIntent("dispatching this to the floor")).toBe(true);
  });
});

describe("detectIssueIntent — everything else drafts", () => {
  it("does NOT fire on plain creation verbs", () => {
    expect(detectIssueIntent("Create a work order to rack T3 to T4")).toBe(false);
    expect(detectIssueIntent("make me a work order for topping Hall C")).toBe(false);
    expect(detectIssueIntent("draft a work order for the Pinot barrels")).toBe(false);
    expect(detectIssueIntent("set up a rack from T12 to T15")).toBe(false);
    expect(detectIssueIntent("build a topping round for tomorrow")).toBe(false);
  });

  it("does NOT fire when the user explicitly withholds the issue", () => {
    expect(detectIssueIntent("create the work order but don't issue it yet")).toBe(false);
    expect(detectIssueIntent("draft it, do not issue")).toBe(false);
    expect(detectIssueIntent("set it up without issuing it")).toBe(false);
    expect(detectIssueIntent("make the order, no need to issue it now")).toBe(false);
    expect(detectIssueIntent("hold off on issuing that")).toBe(false);
    expect(detectIssueIntent("build it but do not issue the order")).toBe(false);
  });

  it("does NOT fire on a question about issuing", () => {
    expect(detectIssueIntent("Should I issue this?")).toBe(false);
    expect(detectIssueIntent("when did we issue WO #12?")).toBe(false);
    expect(detectIssueIntent("do we issue these on Fridays?")).toBe(false);
    expect(detectIssueIntent("can you issue work orders?")).toBe(false);
  });

  it("still fires when an instruction merely ends with a follow-up question", () => {
    // "Issue it to Mike" is an instruction; the trailing question does not undo it.
    expect(detectIssueIntent("Issue it to Mike. Which barrels should I include?")).toBe(true);
  });

  it("is safe on absent, empty and non-string input", () => {
    expect(detectIssueIntent(undefined)).toBe(false);
    expect(detectIssueIntent(null)).toBe(false);
    expect(detectIssueIntent("")).toBe(false);
    expect(detectIssueIntent("   ")).toBe(false);
    expect(detectIssueIntent(123 as unknown as string)).toBe(false);
  });

  it("bounds the scan on an unbounded user string", () => {
    // The verb sits past the 2000-char scan window, so it is not seen. Safe direction: draft.
    expect(detectIssueIntent("x".repeat(2100) + " issue it")).toBe(false);
    expect(detectIssueIntent("issue it " + "x".repeat(2100))).toBe(true);
  });

  it("does not fire on unrelated words that merely contain the verb", () => {
    expect(detectIssueIntent("there is a tissue of problems with T3")).toBe(false);
    expect(detectIssueIntent("check the reissuance paperwork")).toBe(false);
  });
});

describe("primaryActionLabel", () => {
  it("names the act the press actually performs", () => {
    expect(primaryActionLabel(false)).toBe("Review & create");
    expect(primaryActionLabel(true)).toBe("Review & issue");
  });
});

describe("issueOnConfirmFromArgs — the signed flag, read back at commit", () => {
  it("only a literal true issues", () => {
    expect(issueOnConfirmFromArgs({ issueOnConfirm: true })).toBe(true);
    expect(issueOnConfirmFromArgs({ issueOnConfirm: false })).toBe(false);
  });

  it("falls through to DRAFT for an older token that predates the field", () => {
    expect(issueOnConfirmFromArgs({})).toBe(false);
    expect(issueOnConfirmFromArgs({ sourceText: "rack T3 to T4" })).toBe(false);
  });

  it("refuses truthy-but-not-true values (a tampered or coerced payload)", () => {
    expect(issueOnConfirmFromArgs({ issueOnConfirm: "true" })).toBe(false);
    expect(issueOnConfirmFromArgs({ issueOnConfirm: 1 })).toBe(false);
    expect(issueOnConfirmFromArgs({ issueOnConfirm: {} })).toBe(false);
  });
});

describe("hasIssueIntentContract — the deploy hazard (council C2)", () => {
  it("recognises a token minted under the new contract, either way", () => {
    expect(hasIssueIntentContract({ issueOnConfirm: true })).toBe(true);
    expect(hasIssueIntentContract({ issueOnConfirm: false })).toBe(true);
  });

  it("rejects a pre-change token, whose card said 'Create and issue'", () => {
    // Absence is the marker: every post-change token carries the key explicitly.
    expect(hasIssueIntentContract({})).toBe(false);
    expect(hasIssueIntentContract({ schemaVersion: 2, sourceText: "rack T3 to T4" })).toBe(false);
  });

  it("rejects a non-boolean value rather than treating it as present", () => {
    expect(hasIssueIntentContract({ issueOnConfirm: "true" })).toBe(false);
    expect(hasIssueIntentContract({ issueOnConfirm: null })).toBe(false);
    expect(hasIssueIntentContract({ issueOnConfirm: undefined })).toBe(false);
  });
});

describe("every work-order committer is gated — the guard, not the fix", () => {
  // Plan 105, extended after the first live test. FOUR tools create work orders and all four issued
  // in one press; the original change gated only propose_work_order. The user's plain phrasing
  // ("make me a work order for punch down on T5") routed to issue_cap_management_wo and would have
  // published to the floor. Naming them individually would rot, so this asserts the RULE:
  // if a tool can issue, it must consult the signed intent first.
  const TOOLS_DIR = fileURLToPath(new URL("../src/lib/assistant/tools", import.meta.url));

  it("any tool that calls issueWorkOrderAction also reads the signed issue intent", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(TOOLS_DIR)) {
      if (!name.endsWith(".ts")) continue;
      const src = readFileSync(join(TOOLS_DIR, name), "utf8");
      if (!src.includes("issueWorkOrderAction({")) continue; // does not issue — nothing to gate
      const gated = src.includes("issueOnConfirmFromArgs(") && src.includes("hasIssueIntentContract(");
      if (!gated) offenders.push(name);
    }
    expect(
      offenders,
      `these tools issue a work order without consulting the signed intent: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("covers the four known work-order paths (so the scan above is not vacuous)", () => {
    const issuing = readdirSync(TOOLS_DIR)
      .filter((n) => n.endsWith(".ts"))
      .filter((n) => readFileSync(join(TOOLS_DIR, n), "utf8").includes("issueWorkOrderAction({"));
    expect(issuing.sort()).toEqual([
      "create-work-order.ts",
      "issue-operation-wo.ts",
      "propose-work-order.ts",
      "work-orders-write.ts",
    ]);
  });
});
