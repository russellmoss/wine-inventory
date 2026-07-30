import { describe, expect, it } from "vitest";
import {
  decidePostCommitNav,
  parseCommitNavTarget,
  isAssistantPage,
  type PostCommitNavDecision,
} from "@/lib/assistant/post-commit-nav";

// Plan 105 U2 — after a confirmed write, do we actually navigate?
// Every branch here is a rule from the plan's failure-branch table. The two that matter most are
// the assistant-page ones: navigating away FROM /assistant ends the session (the page does not
// survive client navigation), and navigating TO it unmounts the dock. Either one loses the
// conversation AC-W2 requires to continue.

const TARGET = { path: "/work-orders/wo_1", label: "Draft WO #318" };

function decide(over: Partial<Parameters<typeof decidePostCommitNav>[0]> = {}): PostCommitNavDecision {
  return decidePostCommitNav({ target: TARGET, currentPath: "/vessels", hasUnsavedChanges: false, ...over });
}

describe("decidePostCommitNav — the happy path", () => {
  it("navigates to the created object", () => {
    expect(decide()).toEqual({ kind: "navigate", path: "/work-orders/wo_1", label: "Draft WO #318", reason: "ok" });
  });

  it("navigates from the dashboard too", () => {
    expect(decide({ currentPath: "/" }).kind).toBe("navigate");
  });
});

describe("decidePostCommitNav — the assistant page, both directions", () => {
  it("does NOT navigate away from the full-page assistant (it would end the session)", () => {
    const d = decide({ currentPath: "/assistant" });
    expect(d.kind).toBe("link_only");
    expect(d.reason).toBe("source_is_assistant");
  });

  it("treats a sub-route and a query string as the assistant page too", () => {
    expect(decide({ currentPath: "/assistant/c/abc123" }).reason).toBe("source_is_assistant");
    expect(decide({ currentPath: "/assistant?tab=history" }).reason).toBe("source_is_assistant");
  });

  it("does NOT navigate TO the assistant page (the dock unmounts there)", () => {
    const d = decide({ currentPath: "/vessels", target: { path: "/assistant", label: "Assistant" } });
    expect(d.kind).toBe("link_only");
    expect(d.reason).toBe("target_is_assistant");
  });

  it("source wins over target when both are the assistant page", () => {
    const d = decide({ currentPath: "/assistant", target: { path: "/assistant/c/x", label: "Chat" } });
    expect(d.reason).toBe("source_is_assistant");
  });

  it("does not mistake a lookalike route for the assistant page", () => {
    expect(isAssistantPage("/assistants")).toBe(false);
    expect(isAssistantPage("/my-assistant")).toBe(false);
    expect(decide({ currentPath: "/assistants" }).kind).toBe("navigate");
  });
});

describe("decidePostCommitNav — already there", () => {
  it("does nothing when the user is already on the object (refresh covers it)", () => {
    const d = decide({ currentPath: "/work-orders/wo_1" });
    expect(d).toEqual({ kind: "none", reason: "already_there" });
  });

  it("ignores a trailing slash and a query string when comparing", () => {
    expect(decide({ currentPath: "/work-orders/wo_1/" }).reason).toBe("already_there");
    expect(decide({ currentPath: "/work-orders/wo_1?tab=tasks" }).reason).toBe("already_there");
  });

  it("a DIFFERENT work order is still a navigation", () => {
    expect(decide({ currentPath: "/work-orders/wo_2" }).kind).toBe("navigate");
  });
});

describe("decidePostCommitNav — unsaved work", () => {
  it("never moves a user off a page with unsaved edits", () => {
    const d = decide({ hasUnsavedChanges: true });
    expect(d.kind).toBe("link_only");
    expect(d.reason).toBe("unsaved_changes");
    // The target must still be carried, so the card's own "View X →" stays clickable.
    expect(d).toMatchObject({ path: "/work-orders/wo_1", label: "Draft WO #318" });
  });

  it("the assistant-page rules still win over unsaved work", () => {
    expect(decide({ currentPath: "/assistant", hasUnsavedChanges: true }).reason).toBe("source_is_assistant");
  });
});

describe("decidePostCommitNav — nothing to do", () => {
  it("handles a commit with no navigate payload", () => {
    expect(decide({ target: null })).toEqual({ kind: "none", reason: "no_target" });
    expect(decide({ target: undefined })).toEqual({ kind: "none", reason: "no_target" });
  });

  it("refuses a malformed payload", () => {
    expect(decide({ target: { path: "/work-orders/wo_1" } }).reason).toBe("no_target"); // no label
    expect(decide({ target: { label: "x" } }).reason).toBe("no_target"); // no path
    expect(decide({ target: { path: "/x", label: "" } }).reason).toBe("no_target"); // empty label
  });

  it("refuses an unsafe path outright — never navigate, never link", () => {
    const cases = ["https://evil.example.com", "//evil.example.com", "javascript:alert(1)", "/a\\b", "work-orders/1"];
    for (const path of cases) {
      const d = decide({ target: { path, label: "x" } });
      expect(d, `path ${JSON.stringify(path)} must be refused`).toEqual({ kind: "none", reason: "unsafe_path" });
    }
  });
});

describe("parseCommitNavTarget — the confirm response is JSON, not an AssistantEvent", () => {
  it("accepts a well-formed target", () => {
    expect(parseCommitNavTarget({ path: "/lots/l1", label: "Lot C-1410" })).toEqual({
      path: "/lots/l1",
      label: "Lot C-1410",
    });
  });

  it("rejects anything else", () => {
    expect(parseCommitNavTarget(undefined)).toBeNull();
    expect(parseCommitNavTarget(null)).toBeNull();
    expect(parseCommitNavTarget("/lots/l1")).toBeNull();
    expect(parseCommitNavTarget({ path: "/lots/l1" })).toBeNull();
    expect(parseCommitNavTarget({ path: 42, label: "x" })).toBeNull();
    expect(parseCommitNavTarget({ path: "https://evil.example.com", label: "x" })).toBeNull();
    expect(parseCommitNavTarget({ path: "//evil.example.com", label: "x" })).toBeNull();
  });
});
