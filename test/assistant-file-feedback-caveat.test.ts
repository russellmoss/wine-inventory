import { describe, it, expect, beforeAll } from "vitest";
import { verifyProposal } from "@/lib/assistant/confirm";

// Scope item 3 of the cmsgbjgov investigation: an assistant-AUTHORED ticket inherits the model's
// blind spot. The real ticket body asserted "no confirmation card rendered" as flat fact, and triage
// went after a rendering bug that did not exist while seven committed writes sat in the database.
//
// The fix is not to censor the report — the user's experience is real and worth filing — but to mark
// the provenance of the unverifiable part, deterministically, in the payload triage actually reads.

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-proposal-signing";
});

const { fileFeedbackTool } = await import("@/lib/assistant/tools/file-feedback");

async function fileIt(body: string) {
  const out = (await fileFeedbackTool.run({} as never, {
    kind: "bug",
    title: "Assistant confirmation cards",
    body,
  })) as { preview: string; token: string };
  // `args` is Record<string, unknown> by design (the payload is tool-agnostic), so narrow at the edge.
  const verified = verifyProposal(out.token);
  return { preview: out.preview, body: String(verified!.args.body) };
}

describe("file_feedback — unverified client-state caveat", () => {
  it("marks a body that asserts the card did not render", async () => {
    const { body } = await fileIt(
      "The user asked me to create four work orders. No confirmation card rendered, so nothing got saved.",
    );
    expect(body).toContain("added automatically");
    expect(body).toContain("UNVERIFIED");
    // The original report survives verbatim — the caveat annotates it, never replaces it.
    expect(body).toContain("No confirmation card rendered");
  });

  it("leaves an ordinary report completely untouched", async () => {
    const plain =
      "The user reports that after confirming a work-order card, the page did not navigate to the draft. " +
      "Work order #83, Demo Winery.";
    const { body } = await fileIt(plain);
    expect(body).toBe(plain);
  });

  it("does not touch a report that correctly attributes the claim to the user", async () => {
    // The wording the prompt rule asks for. Reporting what the user SAID is always legitimate; it is
    // only the assistant's own diagnosis of a surface it cannot see that gets marked.
    const { body } = await fileIt(
      "The user reports the confirmation card did not appear on their screen. I called create_work_order " +
        "four times and each call returned a proposal.",
    );
    expect(body).not.toContain("added automatically");
  });

  it("keeps the caveat out of the preview the user confirms", async () => {
    // The card shows the user the report they described. The caveat is addressed to engineering.
    const { preview } = await fileIt("No confirmation card rendered for any of the seven writes.");
    expect(preview).not.toContain("added automatically");
  });

  it("never lets the caveat push the signed body past the 6000-char cap", async () => {
    const { body } = await fileIt(`No confirmation card rendered. ${"x".repeat(7000)}`);
    expect(body.length).toBeLessThanOrEqual(6000);
    expect(body).toContain("UNVERIFIED");
  });
});
