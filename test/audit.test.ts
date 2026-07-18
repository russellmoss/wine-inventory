import { describe, it, expect } from "vitest";
import {
  diff,
  summarize,
  isOperationalAuditEntry,
  operationalAuditWhere,
  NON_OPERATIONAL_AUDIT_ENTITY_TYPES,
  NON_OPERATIONAL_AUDIT_ACTIONS,
} from "@/lib/audit";

describe("diff", () => {
  it("returns only changed fields", () => {
    const before = { name: "Tank 1", capacityL: 1000, isActive: true };
    const after = { name: "Tank 1", capacityL: 1200, isActive: true };
    expect(diff(before, after)).toEqual({
      capacityL: { from: 1000, to: 1200 },
    });
  });

  it("ignores unchanged records", () => {
    const rec = { a: 1, b: "x" };
    expect(diff(rec, { ...rec })).toEqual({});
  });

  it("treats null before as create (all fields present)", () => {
    const after = { name: "Merlot" };
    expect(diff(null, after)).toEqual({ name: { from: null, to: "Merlot" } });
  });

  it("treats null after as delete", () => {
    const before = { name: "Merlot" };
    expect(diff(before, null)).toEqual({ name: { from: "Merlot", to: null } });
  });

  it("compares Date values by ISO, not reference", () => {
    const d1 = new Date("2026-01-01T00:00:00.000Z");
    const d2 = new Date("2026-01-01T00:00:00.000Z");
    const d3 = new Date("2026-02-01T00:00:00.000Z");
    expect(diff({ at: d1 }, { at: d2 })).toEqual({});
    expect(diff({ at: d1 }, { at: d3 })).toEqual({
      at: { from: d1.toISOString(), to: d3.toISOString() },
    });
  });

  it("compares Decimal-like objects by toString", () => {
    const dec = (s: string) => ({ toString: () => s });
    expect(diff({ v: dec("10.00") }, { v: dec("10.00") })).toEqual({});
    expect(diff({ v: dec("10.00") }, { v: dec("12.50") })).toEqual({
      v: { from: "10.00", to: "12.50" },
    });
  });
});

describe("summarize", () => {
  it("describes create/delete", () => {
    expect(summarize("CREATE", "Location", { label: "Cellar A" })).toBe(
      'Created Location "Cellar A"',
    );
    expect(summarize("USER_DELETED", "User", { label: "a@b.com" })).toBe(
      'Deleted User "a@b.com"',
    );
  });

  it("lists field changes for updates", () => {
    const s = summarize("UPDATE", "Vessel", {
      label: "T1",
      changes: { capacityL: { from: 1000, to: 1200 } },
    });
    expect(s).toBe('Updated Vessel "T1" (capacityL: 1000 -> 1200)');
  });

  it("handles login + password events", () => {
    expect(summarize("LOGIN", "Session")).toBe("Signed in");
    expect(summarize("PASSWORD_CHANGE", "User")).toBe("Changed password");
  });
});

describe("isOperationalAuditEntry (leadership dashboard filter, #241)", () => {
  it("keeps operational winemaking activity", () => {
    // The exact example from the feedback: "we bottled wine today".
    expect(isOperationalAuditEntry({ action: "BOTTLING", entityType: "BottlingRun" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "STOCK_MOVEMENT", entityType: "LotOperation" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "STOCK_MOVEMENT", entityType: "BottledInventory" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "CREATE", entityType: "Lot" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "CREATE", entityType: "SupplyLot" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "HARVEST_PICK_RECORDED", entityType: "HarvestPick" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "CREATE", entityType: "WorkOrder" })).toBe(true);
    expect(isOperationalAuditEntry({ action: "BRIX_LOGGED", entityType: "BrixLog" })).toBe(true);
  });

  it("hides bug-triage and developer-automation noise", () => {
    expect(isOperationalAuditEntry({ action: "UPDATE", entityType: "FEEDBACK_TICKET" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "UPDATE", entityType: "ASSISTANT_FEEDBACK" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "UPDATE", entityType: "AutomationRun" })).toBe(false);
  });

  it("hides auth, security, and admin churn", () => {
    expect(isOperationalAuditEntry({ action: "LOGIN", entityType: "Session" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "PASSWORD_CHANGE", entityType: "User" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "IMPERSONATE", entityType: "Organization" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "USER_CREATED", entityType: "User" })).toBe(false);
    // A benign UPDATE on a denylisted entity type is still hidden (user admin, settings).
    expect(isOperationalAuditEntry({ action: "UPDATE", entityType: "User" })).toBe(false);
    expect(isOperationalAuditEntry({ action: "UPDATE", entityType: "AppSettings" })).toBe(false);
  });

  it("hides an operational-looking action on a denylisted entity type", () => {
    // IMPERSONATE is a denylisted action even though Organization isn't a denylisted type.
    expect(isOperationalAuditEntry({ action: "IMPERSONATE", entityType: "Organization" })).toBe(false);
  });

  it("stays in sync with the Prisma where fragment", () => {
    expect(operationalAuditWhere.entityType).toEqual({ notIn: [...NON_OPERATIONAL_AUDIT_ENTITY_TYPES] });
    expect(operationalAuditWhere.action).toEqual({ notIn: NON_OPERATIONAL_AUDIT_ACTIONS });
  });
});
