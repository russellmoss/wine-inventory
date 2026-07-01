import { describe, it, expect } from "vitest";
import { runAsTenant, getTenantId, requireTenantId, getTenantContext, runWithTenantContext } from "@/lib/tenant/context";
import { isGlobalModel, injectTenantId, GLOBAL_MODELS } from "@/lib/tenant/models";

describe("tenant context (AsyncLocalStorage)", () => {
  it("exposes the tenant inside runAsTenant and nowhere outside", async () => {
    expect(getTenantId()).toBeUndefined();
    await runAsTenant("orgA", async () => {
      expect(getTenantId()).toBe("orgA");
      expect(requireTenantId()).toBe("orgA");
    });
    expect(getTenantId()).toBeUndefined();
  });

  it("requireTenantId throws with no context (fail-closed)", () => {
    expect(() => requireTenantId()).toThrow(/no tenant context/i);
  });

  it("does not bleed across concurrent contexts (K12/DQ9)", async () => {
    // Interleave two tenant contexts; each must only ever see its own id.
    const seenA: (string | undefined)[] = [];
    const seenB: (string | undefined)[] = [];
    await Promise.all([
      runAsTenant("orgA", async () => {
        await Promise.resolve();
        seenA.push(getTenantId());
        await new Promise((r) => setTimeout(r, 5));
        seenA.push(getTenantId());
      }),
      runAsTenant("orgB", async () => {
        seenB.push(getTenantId());
        await new Promise((r) => setTimeout(r, 2));
        seenB.push(getTenantId());
      }),
    ]);
    expect(seenA).toEqual(["orgA", "orgA"]);
    expect(seenB).toEqual(["orgB", "orgB"]);
  });

  it("runWithTenantContext carries the skipWrap flag (ledger path)", async () => {
    await runWithTenantContext({ tenantId: "orgA", skipWrap: true }, async () => {
      expect(getTenantContext()).toEqual({ tenantId: "orgA", skipWrap: true });
    });
  });
});

describe("global-model denylist (K3)", () => {
  it("marks exactly the auth + org tables as global", () => {
    expect([...GLOBAL_MODELS].sort()).toEqual(
      ["Account", "Invitation", "Member", "Organization", "Session", "User", "Verification"].sort(),
    );
    for (const m of ["User", "Session", "Organization", "Member", "Invitation"]) expect(isGlobalModel(m)).toBe(true);
    for (const m of ["Lot", "Vessel", "AppSettings", "AuditLog"]) expect(isGlobalModel(m)).toBe(false);
  });
});

describe("tenantId create-injection (WITH-CHECK backstop)", () => {
  it("injects tenantId on create when absent", () => {
    const args: Record<string, unknown> = { data: { code: "X" } };
    injectTenantId("create", args, "orgA");
    expect((args.data as Record<string, unknown>).tenantId).toBe("orgA");
  });

  it("does NOT overwrite an explicit tenantId", () => {
    const args: Record<string, unknown> = { data: { code: "X", tenantId: "orgB" } };
    injectTenantId("create", args, "orgA");
    expect((args.data as Record<string, unknown>).tenantId).toBe("orgB");
  });

  it("injects into every row of createMany", () => {
    const args: Record<string, unknown> = { data: [{ code: "X" }, { code: "Y", tenantId: "orgB" }] };
    injectTenantId("createMany", args, "orgA");
    expect(args.data).toEqual([{ code: "X", tenantId: "orgA" }, { code: "Y", tenantId: "orgB" }]);
  });

  it("injects into upsert.create", () => {
    const args: Record<string, unknown> = { where: { id: "1" }, create: { code: "X" }, update: { code: "X" } };
    injectTenantId("upsert", args, "orgA");
    expect((args.create as Record<string, unknown>).tenantId).toBe("orgA");
  });

  it("leaves read operations untouched", () => {
    const args: Record<string, unknown> = { where: { id: "1" } };
    injectTenantId("findUnique", args, "orgA");
    expect(args).toEqual({ where: { id: "1" } });
  });
});
