import { describe, expect, it } from "vitest";
import { canApprove, shouldAutoFinalize } from "@/lib/work-orders/authority";

describe("work-order approval authority", () => {
  it("allows admins and developers to approve", () => {
    expect(canApprove({ id: "admin", role: "admin" }).ok).toBe(true);
    expect(canApprove({ id: "dev", role: "developer" }).ok).toBe(true);
  });

  it("does not allow regular users to approve", () => {
    expect(canApprove({ id: "user", role: "user" }).ok).toBe(false);
  });

  it("lets developer-completed auto-finalize work finalize immediately", () => {
    expect(shouldAutoFinalize({ id: "dev", role: "developer" }, { autoFinalize: true })).toBe(true);
  });
});
