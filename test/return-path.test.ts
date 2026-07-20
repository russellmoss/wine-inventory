import { describe, it, expect } from "vitest";
import { safeReturnPath, DEFAULT_RETURN_PATH } from "@/lib/auth/return-path";

// Plan 080 U6. Two things are locked here:
//  • the FEATURE — a section deep link must survive the login bounce, or `/inventory?section=consumables`
//    (from an old-route redirect or the assistant's navigate) silently lands on the default tab;
//  • the OPEN REDIRECT — `from` is fed to router.push()/callbackURL, so an absolute or protocol-relative
//    value would bounce a freshly-authenticated user off-site. That bug predates plan 080; widening `from`
//    to carry the query string is what made fixing it non-optional.

describe("safeReturnPath — keeps legitimate internal paths (incl. the query)", () => {
  it("preserves a section deep link", () => {
    expect(safeReturnPath("/inventory?section=consumables")).toBe("/inventory?section=consumables");
    expect(safeReturnPath("/inventory?section=equipment")).toBe("/inventory?section=equipment");
  });

  it("preserves plain paths, nested paths, hashes and multi-param queries", () => {
    expect(safeReturnPath("/inventory")).toBe("/inventory");
    expect(safeReturnPath("/work-orders/123/execute")).toBe("/work-orders/123/execute");
    expect(safeReturnPath("/setup/expendables/ingest?batch=abc&x=1")).toBe("/setup/expendables/ingest?batch=abc&x=1");
    expect(safeReturnPath("/lots#history")).toBe("/lots#history");
  });

  it("falls back to / when absent or empty", () => {
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(undefined)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("   ")).toBe(DEFAULT_RETURN_PATH);
  });
});

describe("safeReturnPath — refuses anything that could leave the origin (open-redirect guard)", () => {
  it("refuses absolute URLs", () => {
    for (const bad of ["https://evil.com", "http://evil.com/x", "HTTPS://evil.com"]) {
      expect(safeReturnPath(bad), bad).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it("refuses protocol-relative references (the classic bypass of a naive startsWith('/') check)", () => {
    for (const bad of ["//evil.com", "//evil.com/path", "/\\evil.com", "/\\/evil.com"]) {
      expect(safeReturnPath(bad), bad).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it("refuses backslashes anywhere (browsers may normalize them to '/')", () => {
    expect(safeReturnPath("/inventory\\@evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/\\\\evil.com")).toBe(DEFAULT_RETURN_PATH);
  });

  it("refuses non-http schemes and bare (non-absolute) paths", () => {
    for (const bad of ["javascript:alert(1)", "mailto:a@b.c", "data:text/html,x", "inventory", "./inventory", "../etc"]) {
      expect(safeReturnPath(bad), bad).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it("refuses embedded control characters (URL parsers strip them, smuggling a scheme past the checks)", () => {
    expect(safeReturnPath("/inv" + String.fromCharCode(10) + "entory")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/" + String.fromCharCode(9) + "/evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/x" + String.fromCharCode(0))).toBe(DEFAULT_RETURN_PATH);
    // leading control chars survive trim() only as codes < 0x20, so they must still be caught
    expect(safeReturnPath(String.fromCharCode(1) + "//evil.com")).toBe(DEFAULT_RETURN_PATH);
  });

  it("never bounces back to /login (would trap the user in a loop)", () => {
    expect(safeReturnPath("/login")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/login?from=%2Finventory")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/login/reset")).toBe(DEFAULT_RETURN_PATH);
    // but a path that merely STARTS with those letters is fine
    expect(safeReturnPath("/logins-report")).toBe("/logins-report");
  });
});
