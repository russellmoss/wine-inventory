import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * Regression guard for a P0 that shipped silently: every generic-CRUD confirm
 * (db_create / db_update / db_delete) died with
 *
 *   "No tenant context — wrap this call in runAsTenant()."
 *
 * and wrote nothing. Reproduced live in the browser against Demo Winery on 2026-07-20; also
 * reproduced on the commit BEFORE plan 082, so it is not a plan-082 regression.
 *
 * WHY IT ESCAPED EVERY EXISTING GATE. The assistant confirm path is an API route, not a server
 * action, so nothing upstream ran `action()` — which is what opens the ALS tenant context.
 * Committers that delegate to a real server action inherited the context from that action and
 * worked; the three generic CRUD committers call `runInTenantTx` directly, and it does
 * `requireTenantId()` and fails closed. No unit test executed a committer, and the MUST_PROPOSE
 * eval never executes tools at all — so a green suite and a green eval said nothing about it.
 *
 * The probe replaces the REAL `commitDbUpdate`, so this exercises the exact registration that
 * broke rather than a synthetic entry (COMMITTERS is deliberately private — the codebase exposes
 * only `committerToolNames()`).
 */

const seen: {
  nonceInsertTenant?: string;
  committerTenant?: string;
  committerUser?: string;
  calls: number;
} = { calls: 0 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // The single-use nonce insert. It is a tenant-scoped table, so it must ALSO be inside the
    // context — it records what it saw.
    assistantConfirmation: {
      create: async () => {
        const { getTenantId } = await import("@/lib/tenant/context");
        seen.nonceInsertTenant = getTenantId();
        return {};
      },
    },
  },
  prismaBase: {},
}));

vi.mock("@/lib/assistant/tools/db-update", () => ({
  commitDbUpdate: async () => {
    const { getTenantId, getContextUserId } = await import("@/lib/tenant/context");
    seen.calls += 1;
    seen.committerTenant = getTenantId();
    seen.committerUser = getContextUserId();
    return { message: "probe ok" };
  },
  dbUpdate: { name: "db_update", kind: "write", inputSchema: { type: "object", properties: {} }, run: async () => ({}) },
}));

let signProposal: typeof import("@/lib/assistant/confirm").signProposal;
let commitProposal: typeof import("@/lib/assistant/commit").commitProposal;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
  ({ signProposal } = await import("@/lib/assistant/confirm"));
  ({ commitProposal } = await import("@/lib/assistant/commit"));
});

const USER = {
  id: "u1",
  email: "demo@demo.com",
  activeOrganizationId: "org_demo_winery",
  supportOrganizationId: null,
} as unknown as Parameters<typeof import("@/lib/assistant/commit").commitProposal>[0];

describe("commitProposal establishes tenant context", () => {
  it("runs the db_update committer inside a tenant context (the P0 regression)", async () => {
    const token = signProposal("db_update", { entity: "VineyardBlock", id: "b1", values: { vineCount: 2100 } });
    const result = await commitProposal(USER, token);

    expect(result.message).toBe("probe ok");
    expect(seen.calls).toBe(1);
    // Before the fix this was `undefined`, and the real committer threw before writing anything.
    expect(seen.committerTenant).toBe("org_demo_winery");
  });

  it("carries the acting user id, so per-user inbox RLS still applies", () => {
    // A committer that emits a notification needs `app.user_id` set, exactly as action() does.
    expect(seen.committerUser).toBe("u1");
  });

  it("covers the single-use nonce insert too — it is a tenant-scoped table", () => {
    expect(seen.nonceInsertTenant).toBe("org_demo_winery");
  });

  it("refuses a user with no active organization rather than writing untenanted", async () => {
    const orphan = { id: "u2", email: "x@y.z", activeOrganizationId: null, supportOrganizationId: null } as unknown as typeof USER;
    const token = signProposal("db_update", { entity: "VineyardBlock", id: "b1", values: {} });
    await expect(commitProposal(orphan, token)).rejects.toThrow(/isn't attached to a winery/i);
  });

  it("prefers the support organization when one is set", async () => {
    const support = {
      id: "u3", email: "dev@x.z", activeOrganizationId: "org_demo_winery", supportOrganizationId: "org_other",
    } as unknown as typeof USER;
    const token = signProposal("db_update", { entity: "VineyardBlock", id: "b2", values: {} });
    await commitProposal(support, token);
    expect(seen.committerTenant).toBe("org_other");
  });
});
