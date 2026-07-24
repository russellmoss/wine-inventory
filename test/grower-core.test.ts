import { beforeEach, describe, expect, it, vi } from "vitest";

// Plan 095: the Grower write core. Decision under test (context-ledger, `grower` domain): a THIRD-PARTY
// grower links to a Vendor (link-if-name-exists, else create), an ESTATE grower does not. DB deps are mocked
// (repo convention — the DB-integrated behavior is proven by runAsTenant scripts against the Demo tenant).

const h = vi.hoisted(() => ({ tx: null as unknown as FakeTx }));

vi.mock("@/lib/tenant/tx", () => ({ runInTenantTx: (fn: (tx: unknown) => unknown) => fn(h.tx) }));
vi.mock("@/lib/tenant/context", () => ({ requireTenantId: () => "t1" }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));

import { createGrowerCore } from "@/lib/grower/grower-core";

type FakeTx = ReturnType<typeof makeTx>;

function makeTx(opts: { growerClash?: { id: string } | null; existingVendor?: { id: string } | null } = {}) {
  return {
    grower: {
      findFirst: vi.fn().mockResolvedValue(opts.growerClash ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "g1",
        name: data.name ?? null,
        company: data.company ?? null,
        contact: null,
        contactName: data.contactName ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        vendorId: data.vendorId ?? null,
        isEstate: data.isEstate ?? false,
        isActive: true,
      })),
    },
    growerContact: {
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    vendor: {
      findFirst: vi.fn().mockResolvedValue(opts.existingVendor ?? null),
      create: vi.fn().mockResolvedValue({ id: "v-new" }),
    },
  };
}

const actor = {} as never;

describe("createGrowerCore — vendor link (plan 095)", () => {
  beforeEach(() => {
    h.tx = makeTx();
  });

  it("third-party grower creates a NEW linked vendor and stamps vendorId", async () => {
    h.tx = makeTx({ existingVendor: null });
    const res = await createGrowerCore(actor, { name: "Bien Nacido", phone: "805-555-1000", isEstate: false });
    expect(res.ok).toBe(true);
    expect(h.tx.vendor.create).toHaveBeenCalledTimes(1);
    const growerData = h.tx.grower.create.mock.calls[0][0].data;
    expect(growerData.vendorId).toBe("v-new");
    if (res.ok) expect(res.grower.vendorId).toBe("v-new");
  });

  it("third-party grower LINKS to an existing same-name vendor instead of duplicating", async () => {
    h.tx = makeTx({ existingVendor: { id: "v-existing" } });
    const res = await createGrowerCore(actor, { name: "Sunny Slope", isEstate: false });
    expect(res.ok).toBe(true);
    expect(h.tx.vendor.create).not.toHaveBeenCalled();
    expect(h.tx.grower.create.mock.calls[0][0].data.vendorId).toBe("v-existing");
  });

  it("ESTATE grower gets NO vendor link", async () => {
    h.tx = makeTx();
    const res = await createGrowerCore(actor, { name: "Home Vineyard", isEstate: true });
    expect(res.ok).toBe(true);
    expect(h.tx.vendor.findFirst).not.toHaveBeenCalled();
    expect(h.tx.vendor.create).not.toHaveBeenCalled();
    expect(h.tx.grower.create.mock.calls[0][0].data.vendorId).toBeNull();
  });

  it("persists additional contacts with a single primary", async () => {
    h.tx = makeTx();
    const res = await createGrowerCore(actor, {
      name: "Contacts Co",
      isEstate: true,
      contacts: [
        { name: "Ana", isPrimary: true },
        { name: "Beto", isPrimary: true },
      ],
    });
    expect(res.ok).toBe(true);
    expect(h.tx.growerContact.createMany).toHaveBeenCalledTimes(1);
    const rows = h.tx.growerContact.createMany.mock.calls[0][0].data as Array<{ isPrimary: boolean; tenantId: string }>;
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false]);
    expect(rows.every((r) => r.tenantId === "t1")).toBe(true); // explicit tenantId on createMany
  });

  it("refuses a name clash without creating a vendor", async () => {
    h.tx = makeTx({ growerClash: { id: "g0" } });
    const res = await createGrowerCore(actor, { name: "Dupe", isEstate: false });
    expect(res.ok).toBe(false);
    expect(h.tx.vendor.create).not.toHaveBeenCalled();
    expect(h.tx.grower.create).not.toHaveBeenCalled();
  });
});
