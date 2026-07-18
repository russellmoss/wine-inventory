import { describe, it, expect } from "vitest";
import { makeClarificationRef, buildClarificationDmBody } from "@/lib/feedback/clarification";

describe("makeClarificationRef", () => {
  it("is BUG- + 4 unambiguous chars", () => {
    for (let i = 0; i < 50; i++) {
      const ref = makeClarificationRef();
      expect(ref).toMatch(/^BUG-[A-HJ-NP-Z2-9]{4}$/);
      expect(ref).not.toMatch(/[OI01]/); // no ambiguous chars
    }
  });
});

describe("buildClarificationDmBody", () => {
  const base = { title: "Bottling let me skip the cork", ref: "BUG-7Q2F", questions: ["What page?", "Any error?"] };

  it("states it is automated and carries the ref", () => {
    const body = buildClarificationDmBody(base);
    expect(body).toContain("automated triage");
    expect(body).toContain("Ref: BUG-7Q2F");
    expect(body).toContain("Bottling let me skip the cork");
  });

  it("renders questions as bullets", () => {
    const body = buildClarificationDmBody(base);
    expect(body).toContain("• What page?");
    expect(body).toContain("• Any error?");
  });

  it("caps the number of questions rendered", () => {
    const body = buildClarificationDmBody({ ...base, questions: ["a", "b", "c", "d", "e", "f"] });
    const bullets = body.split("\n").filter((l) => l.startsWith("• "));
    expect(bullets.length).toBeLessThanOrEqual(4);
  });

  it("sets reply expectations (reply here)", () => {
    expect(buildClarificationDmBody(base).toLowerCase()).toContain("reply");
  });
});
