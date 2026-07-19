import { describe, it, expect } from "vitest";
import { debugContextHasErrors } from "@/lib/feedback/sufficiency";

describe("debugContextHasErrors", () => {
  it("is true when clientErrors are present", () => {
    expect(debugContextHasErrors({ clientErrors: [{ level: "error", ts: 1, message: "boom" }] })).toBe(true);
  });
  it("is false for empty / missing / non-object", () => {
    expect(debugContextHasErrors({ clientErrors: [] })).toBe(false);
    expect(debugContextHasErrors({ consoleLog: [{ level: "log", ts: 1, message: "x" }] })).toBe(false);
    expect(debugContextHasErrors(null)).toBe(false);
    expect(debugContextHasErrors("nope")).toBe(false);
  });
});
