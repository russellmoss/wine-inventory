import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Ticket cmrs2eops (issue #309): approving an assistant change card to ADD a variety threw a raw
// unique-constraint error and nothing persisted. The generic db_create layer now guards master-data
// identity (NAMING-1): a case-insensitive existing name is refused with a friendly message at BOTH the
// preview (run) and commit stages, and a P2002 race is caught as a backstop. Proven hermetically here
// (DB deps mocked); the DB-integrated behavior is proven by scripts against the Demo tenant.

const mocks = vi.hoisted(() => ({
  findConflict: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/assistant/confirm", () => ({ signProposal: () => "PROPOSAL_TOKEN" }));
vi.mock("@/lib/access", () => ({ isTenantAdminLike: () => true }));
vi.mock("@/lib/tenant/tx", () => ({
  runInTenantTx: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(), diff: () => ({}) }));

const fakeEntity = {
  name: "Variety",
  displayName: "variety",
  vineyardScoped: false,
  creatable: [{ name: "name", type: "string", required: true, min: 1, max: 80 }],
  buildCreate: async (_u: unknown, v: Record<string, unknown>) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: mocks.create,
  findConflict: mocks.findConflict,
};

vi.mock("@/lib/assistant/entities", () => ({
  getEntity: (n: string) => (n?.toLowerCase() === "variety" ? fakeEntity : null),
  allowedEntityNames: () => ["Variety"],
}));

import { dbCreateTool, commitDbCreate } from "@/lib/assistant/tools/db-create";

const ctx = { user: { role: "admin", vineyardIds: [] } } as never;
const user = { id: "u1", email: "a@b.c", role: "admin", vineyardIds: [] } as never;

describe("db_create master-data identity guard", () => {
  beforeEach(() => {
    mocks.findConflict.mockReset();
    mocks.create.mockReset();
  });

  it("run: refuses an existing name (case-insensitive) with a friendly message, no card", async () => {
    mocks.findConflict.mockResolvedValue({ label: "Syrah" });
    await expect(dbCreateTool.run(ctx, { entity: "Variety", values: { name: "syrah" } })).rejects.toThrow(/already exists/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("run: proposes a confirmation card when there is no conflict", async () => {
    mocks.findConflict.mockResolvedValue(null);
    const out = (await dbCreateTool.run(ctx, { entity: "Variety", values: { name: "Malbec" } })) as {
      needsConfirmation?: boolean;
      token?: string;
    };
    expect(out.needsConfirmation).toBe(true);
    expect(out.token).toBe("PROPOSAL_TOKEN");
  });

  it("commit: refuses a STALE card whose name now exists (batch/concurrent path), never creates", async () => {
    mocks.findConflict.mockResolvedValue({ label: "Merlot" });
    await expect(commitDbCreate(user, { entity: "Variety", data: { name: "Merlot" }, label: "Merlot" })).rejects.toThrow(
      /already exists/i,
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("commit: creates and persists when there is no conflict", async () => {
    mocks.findConflict.mockResolvedValue(null);
    mocks.create.mockResolvedValue("new-id");
    const res = await commitDbCreate(user, { entity: "Variety", data: { name: "Tempranillo" }, label: "Tempranillo" });
    expect(res.message).toMatch(/Created variety "Tempranillo"/);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("commit: turns a P2002 unique-constraint race into a friendly message, not a raw Prisma error", async () => {
    mocks.findConflict.mockResolvedValue(null); // passes the pre-check, then loses the race
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "x" }),
    );
    await expect(commitDbCreate(user, { entity: "Variety", data: { name: "Grenache" }, label: "Grenache" })).rejects.toThrow(
      /variety already exists/i,
    );
  });
});
