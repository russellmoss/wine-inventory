import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { primaryActionLabel, primaryActionPendingLabel } from "@/lib/assistant/proposal-card";

// Plan 105. A work-order card's press creates a DRAFT and takes you to it, where you can edit,
// cancel or issue. "Confirm" reads as "commit this now" — the reflex the draft flow exists to
// prevent — so those cards say "Review" instead.

describe("primaryActionLabel", () => {
  it("says Review for every tool that lands you on a work order", () => {
    for (const tool of [
      "propose_work_order",
      "create_work_order",
      "issue_operation_wo",
      "issue_cap_management_wo",
    ]) {
      expect(primaryActionLabel(tool), tool).toBe("Review");
      expect(primaryActionPendingLabel(tool), tool).toBe("Creating…");
    }
  });

  it("keeps Confirm for a write that just happens and is over", () => {
    // Nothing to review afterwards — the reading is logged and that is the whole interaction.
    for (const tool of ["log_brix", "record_measurement", "adjust_inventory", "file_feedback"]) {
      expect(primaryActionLabel(tool), tool).toBe("Confirm");
      expect(primaryActionPendingLabel(tool), tool).toBe("Applying…");
    }
  });

  it("falls back to Confirm when the tool is unknown or missing", () => {
    expect(primaryActionLabel(undefined)).toBe("Confirm");
    expect(primaryActionLabel("")).toBe("Confirm");
    expect(primaryActionLabel("some_future_tool")).toBe("Confirm");
  });

  it("every tool that creates a work order says Review — derived from the code, not a hand-list", () => {
    // The source of truth is the tools directory: anything that calls a createWorkOrder* action is a
    // path that lands the user on a work order, so its card must offer Review. Deriving the set here
    // means adding a fifth work-order tool fails this test instead of silently shipping "Confirm".
    const dir = fileURLToPath(new URL("../src/lib/assistant/tools", import.meta.url));
    const creators: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts")) continue;
      const src = readFileSync(join(dir, name), "utf8");
      if (!/createWorkOrder(Action|FromBuildsAction|FromTemplateAction)\s*\(/.test(src)) continue;
      for (const m of src.matchAll(/name:\s*"([a-z0-9_]+)"/g)) creators.push(m[1]);
    }
    expect(creators.length).toBeGreaterThan(0); // guard against a vacuous scan
    for (const tool of creators) {
      expect(primaryActionLabel(tool), `${tool} creates a work order, so its card must say Review`).toBe("Review");
    }
  });
});
