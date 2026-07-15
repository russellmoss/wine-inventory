import { describe, it, expect } from "vitest";
import {
  sanitizeVendor,
  sanitizeVendorContacts,
  normalizeVendorUrl,
  isLikelyEmail,
  matchVendorsByName,
} from "@/lib/vendors/vendors-shared";

describe("sanitizeVendor", () => {
  it("requires a name", () => {
    expect(sanitizeVendor({ name: "  " }).error).toMatch(/name/i);
    expect(sanitizeVendor({ name: "  " }).fields).toBeNull();
  });

  it("trims fields and coerces poRequired", () => {
    const { fields, error } = sanitizeVendor({ name: "  Scott Labs  ", phone: " 555 ", poRequired: true });
    expect(error).toBeNull();
    expect(fields).toMatchObject({ name: "Scott Labs", phone: "555", poRequired: true });
  });

  it("rejects a malformed email", () => {
    expect(sanitizeVendor({ name: "V", email: "not-an-email" }).error).toMatch(/email/i);
  });

  it("accepts a blank email as null (email is optional at the sanitizer level)", () => {
    const { fields } = sanitizeVendor({ name: "V", email: "" });
    expect(fields?.email).toBeNull();
  });

  it("normalizes a bare-domain url to https and drops non-http schemes", () => {
    expect(sanitizeVendor({ name: "V", url: "scottlab.com" }).fields?.url).toBe("https://scottlab.com");
    expect(sanitizeVendor({ name: "V", url: "javascript:alert(1)" }).fields?.url).toBeNull();
  });
});

describe("sanitizeVendorContacts", () => {
  it("drops nameless rows and keeps named ones", () => {
    const { rows, error } = sanitizeVendorContacts([{ name: "" }, { name: "Jane", phone: "555" }]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Jane", phone: "555" });
  });

  it("enforces at most one primary (first primary wins)", () => {
    const { rows } = sanitizeVendorContacts([
      { name: "A", isPrimary: true },
      { name: "B", isPrimary: true },
      { name: "C", isPrimary: true },
    ]);
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false, false]);
  });

  it("rejects a contact with a bad email", () => {
    expect(sanitizeVendorContacts([{ name: "A", email: "bad" }]).error).toMatch(/email/i);
  });

  it("returns no rows for undefined/empty", () => {
    expect(sanitizeVendorContacts(undefined).rows).toEqual([]);
    expect(sanitizeVendorContacts([]).rows).toEqual([]);
  });
});

describe("normalizeVendorUrl / isLikelyEmail", () => {
  it("keeps http(s) urls, https-prefixes bare domains, drops other schemes", () => {
    expect(normalizeVendorUrl("https://x.com")).toBe("https://x.com");
    expect(normalizeVendorUrl("x.com")).toBe("https://x.com");
    expect(normalizeVendorUrl("ftp://x.com")).toBeNull();
    expect(normalizeVendorUrl("")).toBeNull();
  });
  it("validates emails loosely", () => {
    expect(isLikelyEmail("a@b.co")).toBe(true);
    expect(isLikelyEmail("a@b")).toBe(false);
    expect(isLikelyEmail("nope")).toBe(false);
  });
});

describe("matchVendorsByName", () => {
  const all = [
    { id: "v1", name: "Scott Labs" },
    { id: "v2", name: "Gusmer Enterprises" },
    { id: "v3", name: "BSG" },
  ];
  it("matches two-directionally (needle in name and name in needle)", () => {
    expect(matchVendorsByName(all, "scott").map((v) => v.id)).toEqual(["v1"]); // needle ⊂ name
    expect(matchVendorsByName(all, "Scott Labs Incorporated").map((v) => v.id)).toEqual(["v1"]); // name ⊂ needle
  });
  it("prefers an exact normalized match over substring", () => {
    expect(matchVendorsByName(all, "BSG").map((v) => v.id)).toEqual(["v3"]);
  });
  it("pins by #id token", () => {
    expect(matchVendorsByName(all, "#v2").map((v) => v.id)).toEqual(["v2"]);
  });
  it("returns [] for no match / blank", () => {
    expect(matchVendorsByName(all, "zzz")).toEqual([]);
    expect(matchVendorsByName(all, "")).toEqual([]);
  });
});
