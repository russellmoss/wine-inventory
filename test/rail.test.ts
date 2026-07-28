/**
 * The collapsible sidebar's four legitimacy conditions (doc 13 §3, AC-S31–S40).
 *
 * A rail of unlabelled icons IS icon-only navigation, which the design system
 * otherwise prohibits and which the audit flagged. These four rules are what make
 * it legitimate rather than a regression, so they are pinned rather than trusted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isRailToggleShortcut,
  railAnnouncement,
  railItemLabel,
  railStorageKey,
  railToggleLabel,
  readRailPreference,
  serialiseRailPreference,
} from "@/lib/nav/rail";

const SPACING = readFileSync(fileURLToPath(new URL("../src/styles/tokens/spacing.css", import.meta.url)), "utf8");
const COLORS = readFileSync(fileURLToPath(new URL("../src/styles/tokens/colors.css", import.meta.url)), "utf8");

describe("AC-S31 — expanded is the default", () => {
  it("defaults to expanded with no stored preference", () => {
    expect(readRailPreference(null)).toBe(false);
  });

  it("defaults to expanded on an unrecognised value", () => {
    // A corrupt or half-written localStorage value must not silently hand a new
    // user an icon-only rail they never chose.
    expect(readRailPreference("")).toBe(false);
    expect(readRailPreference("garbage")).toBe(false);
  });

  it("only collapses on the explicit value", () => {
    expect(readRailPreference("collapsed")).toBe(true);
    expect(readRailPreference(serialiseRailPreference(true))).toBe(true);
    expect(readRailPreference(serialiseRailPreference(false))).toBe(false);
  });
});

describe("AC-S37 — the preference is scoped per tenant AND per user", () => {
  it("keys on both", () => {
    const a = railStorageKey("org_demo", "user-1");
    const b = railStorageKey("org_demo", "user-2");
    const c = railStorageKey("org_other", "user-1");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain("org_demo");
    expect(a).toContain("user-1");
  });

  it("never lets one admin's choice reach another user", () => {
    // doc 13 §3.1: never a server default, never set by an admin for someone else.
    expect(railStorageKey("t", "u1")).not.toBe(railStorageKey("t", "u2"));
  });
});

describe("AC-S33 / AC-S35 — the label is the accessible name in BOTH states", () => {
  it("returns the same base label whether collapsed or not", () => {
    expect(railItemLabel("Work orders")).toBe("Work orders");
  });

  it("folds the badge count into the name, because the pill becomes a bare dot", () => {
    expect(railItemLabel("Work orders", 4)).toBe("Work orders, 4 open");
  });

  it("does not invent a count when there is none", () => {
    expect(railItemLabel("Lots", 0)).toBe("Lots");
    expect(railItemLabel("Lots", undefined)).toBe("Lots");
  });
});

describe("the toggle control (doc 13 §4)", () => {
  it("names the ACTION, and flips with state", () => {
    expect(railToggleLabel(false)).toBe("Collapse the sidebar");
    expect(railToggleLabel(true)).toBe("Expand the sidebar");
  });

  it("announces the result once", () => {
    expect(railAnnouncement(true)).toBe("Sidebar collapsed.");
    expect(railAnnouncement(false)).toBe("Sidebar expanded.");
  });

  it("binds to Cmd-\\ and Ctrl-\\", () => {
    expect(isRailToggleShortcut({ key: "\\", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isRailToggleShortcut({ key: "\\", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isRailToggleShortcut({ key: "\\", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isRailToggleShortcut({ key: "b", metaKey: true, ctrlKey: false })).toBe(false);
  });
});

describe("AC-S40 / doc 13 §6 — the tokens exist", () => {
  it("defines the rail geometry", () => {
    expect(SPACING).toContain("--rail-w-expanded:  236px;");
    expect(SPACING).toContain("--rail-w-collapsed: 64px;");
    expect(SPACING).toContain("--rail-item:        44px;");
  });

  it("keeps the collapsed icon target at the 44px floor", () => {
    expect(SPACING).toMatch(/--rail-item:\s*44px/);
  });

  it("gives the tooltip a focus delay of zero — it must answer to keyboard focus", () => {
    // doc 13 §3.3: hover-only tooltips are unreachable by keyboard.
    expect(SPACING).toContain("--tooltip-delay-focus: 0ms;");
    expect(SPACING).toContain("--tooltip-delay-hover: 400ms;");
  });

  it("defines the tooltip surface", () => {
    expect(COLORS).toContain("--tooltip-bg: var(--ink-900);");
    expect(COLORS).toContain("--tooltip-fg: var(--cream);");
  });
});
