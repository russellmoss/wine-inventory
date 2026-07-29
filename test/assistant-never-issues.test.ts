import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// THE RULE, as a test: the assistant never issues a work order.
//
// It creates a DRAFT and navigates the user to it; Issue is a human press on the work-order page,
// after they have seen it and made any edits. 03-interaction-spec.md:179 — "A WorkOrder in DRAFT.
// Never ISSUED."
//
// This exists because the first two attempts at this were both wrong, in opposite directions:
//   1. Originally FOUR tools created-and-issued in one press, and the first fix gated only one of
//      them. The other three were missed because they are named issue_* and the reasoning was "the
//      user asked to issue" — but the MODEL picks the tool from the shape of the request, not from
//      the user saying the word.
//   2. The second attempt gated all four on an "explicit issue verb" heuristic. Live testing killed
//      it: a request phrased "...issued to mike juergens" still published straight from the chat
//      card, which is exactly what the user does not want. There is no phrasing that should skip
//      the review step.
//
// So the invariant is flat and has no exceptions, which is why it can be asserted structurally
// rather than case by case. If a future tool needs to issue, this test is the conversation.

const TOOLS_DIR = fileURLToPath(new URL("../src/lib/assistant", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (name.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("the assistant never issues a work order", () => {
  it("no file under src/lib/assistant/ calls issueWorkOrderAction or issueWorkOrderCore", () => {
    const offenders = walk(TOOLS_DIR)
      .filter((p) => /issueWorkOrder(Action|Core)\s*\(/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(TOOLS_DIR.length + 1).split("\\").join("/"));

    expect(
      offenders,
      `these issue a work order from the assistant, which must be a human press instead: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("every work-order committer still returns a deep link, so the user can be taken to the draft", () => {
    // Drafts appear in NO list view, so the navigate payload is the user's route to the thing they
    // just made. A committer that creates a work order without one strands it.
    const creators = walk(TOOLS_DIR).filter((p) => {
      const src = readFileSync(p, "utf8");
      return /createWorkOrder(Action|FromBuildsAction|FromTemplateAction)\s*\(/.test(src);
    });
    expect(creators.length).toBeGreaterThan(0); // guard against a vacuous scan

    const missing = creators
      .filter((p) => !readFileSync(p, "utf8").includes("navigate: {"))
      .map((p) => p.slice(TOOLS_DIR.length + 1).split("\\").join("/"));
    expect(missing, `these create a work order but return no deep link: ${missing.join(", ")}`).toEqual([]);
  });

  it("their receipts say a draft was made, never that something was issued", () => {
    const offenders = walk(TOOLS_DIR)
      .filter((p) => /message: `Issued work order/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(TOOLS_DIR.length + 1).split("\\").join("/"));
    expect(offenders, `these receipts claim an issue that no longer happens: ${offenders.join(", ")}`).toEqual([]);
  });
});
