import { describe, it, expect } from "vitest";
import {
  makeClarificationRef,
  buildClarificationDmBody,
  parseRefToken,
  isSubstantiveAnswer,
} from "@/lib/feedback/clarification";

describe("parseRefToken", () => {
  it("extracts the ref token case-insensitively", () => {
    expect(parseRefToken("it broke on bottling [Ref: BUG-7Q2F] thanks")).toBe("BUG-7Q2F");
    expect(parseRefToken("bug-njaf here's what happened")).toBe("BUG-NJAF");
  });
  it("returns null when no token present", () => {
    expect(parseRefToken("no code here")).toBeNull();
    expect(parseRefToken("BUG-12")).toBeNull(); // too short / ambiguous digits excluded
  });
});

describe("isSubstantiveAnswer", () => {
  it("rejects trivial / too-short replies", () => {
    for (const s of ["idk", "no", "not sure", "n/a", "ok", "?", "  dunno "]) {
      expect(isSubstantiveAnswer(s)).toBe(false);
    }
  });
  it("accepts a real answer", () => {
    expect(isSubstantiveAnswer("It's on the bottling page, console showed a 500")).toBe(true);
  });
});

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
