import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { GLOBAL_MODELS } from "@/lib/tenant/models";
import { memberOfTenant, tenantUserWhere } from "@/lib/users/scope";
import { ensureOrganization } from "./helpers/tenant-fixtures";

/**
 * Phase 12 — cross-tenant isolation, run AS THE app_rls role against a real DB. GATED: only runs
 * when TENANT_ISOLATION_DB=1 (and DATABASE_URL_APP + DATABASE_URL_UNPOOLED are set), so the default
 * `vitest run` (pure, DB-free) stays green. In CI, set those to a test DB/branch to gate merges.
 *
 * TEETH: point DATABASE_URL_APP at the OWNER (BYPASSRLS) and these assertions fail — proof the
 * suite actually tests the boundary. Removing FORCE / the set_config likewise breaks it.
 *
 * H1/D17: in CI, DATABASE_URL_APP points at a TRANSACTION-mode PgBouncer (pool_mode=transaction,
 * default_pool_size=1, empty server_reset_query) in front of Postgres — i.e. the suite runs the way
 * prod does, through a pooler that reuses one physical connection across transactions without scrubbing
 * session state. That is the only configuration in which a session-scoped tenant GUC would leak; the
 * "pooler no-bleed" test below asserts it does not. Against direct Postgres the suite still passes — it
 * only grows the pooler teeth when DATABASE_URL_APP is a transaction pooler (Neon's pooled endpoint, or
 * the CI PgBouncer). See .github/workflows/ci.yml.
 */
const ENABLED = process.env.TENANT_ISOLATION_DB === "1" && !!process.env.DATABASE_URL_APP && !!process.env.DATABASE_URL_UNPOOLED;

const A = "org_demo_winery";
const B = "org_isolation_vitest_b";

describe.skipIf(!ENABLED)("cross-tenant isolation (as app_rls)", () => {
  // Constructed in beforeAll, NOT at describe-collection: Vitest still runs a skipped suite's body to
  // collect it, and `new PrismaClient({ url: undefined })` throws — so building clients here would fail
  // the whole run in any env without the DB vars set (e.g. the plain `vitest run` CI job). beforeAll
  // only runs when the suite is NOT skipped, i.e. exactly when ENABLED and the URLs are present.
  let owner: PrismaClient;
  let app: PrismaClient;

  const asTenant = <T>(t: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t}, true)`;
      return fn(tx);
    });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED } } });
    app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
    // Tenant A is always the Demo Winery sandbox. Create it on a fresh CI DB so the FK-bound
    // fixtures can insert; never write isolation fixtures into Bhutan Wine Co.
    // Atomic (ON CONFLICT DO NOTHING) rather than upsert: developer-feedback-db.test.ts runs in a
    // parallel vitest worker in the same CI job and also ensures `org_demo_winery`, so a plain
    // upsert races and dies with P2002. See test/helpers/tenant-fixtures.ts.
    await ensureOrganization(owner, { id: A, name: "Demo Winery", slug: "demo-winery" });
    await ensureOrganization(owner, { id: B, name: "Iso Vitest B", slug: B });
    await owner.feedbackLinearLink.deleteMany({
      where: {
        id: {
          in: [
            "isov_linear_link_shared",
            "isov_linear_link_cross",
            "isov_linear_link_both",
            "isov_linear_link_neither",
            "isov_linear_link_duplicate",
          ],
        },
      },
    });
    await owner.feedbackTicket.upsert({
      where: { id: "isov_linear_ticket_a1" },
      update: {},
      create: {
        id: "isov_linear_ticket_a1",
        tenantId: A,
        kind: "FEATURE_REQUEST",
        title: "Linear isolation ticket A1",
        body: "Demo fixture",
        actorEmail: "isolation@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
      },
    });
    await owner.feedbackTicket.upsert({
      where: { id: "isov_linear_ticket_a2" },
      update: {},
      create: {
        id: "isov_linear_ticket_a2",
        tenantId: A,
        kind: "FEATURE_REQUEST",
        title: "Linear isolation ticket A2",
        body: "Demo fixture",
        actorEmail: "isolation@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
      },
    });
    await owner.feedbackTicket.upsert({
      where: { id: "isov_linear_ticket_b" },
      update: {},
      create: {
        id: "isov_linear_ticket_b",
        tenantId: B,
        kind: "FEATURE_REQUEST",
        title: "Linear isolation ticket B",
        body: "Isolation fixture",
        actorEmail: "isolation-b@test",
        modeAtSubmission: "REPORT_ONLY",
      },
    });
    await owner.assistantFeedback.upsert({
      where: { id: "isov_linear_feedback_a" },
      update: {},
      create: {
        id: "isov_linear_feedback_a",
        tenantId: A,
        rating: "down",
        comment: "Demo fixture",
        conversation: [],
        actorEmail: "isolation@demowinery.test",
      },
    });
    await owner.assistantFeedback.upsert({
      where: { id: "isov_linear_feedback_b" },
      update: {},
      create: {
        id: "isov_linear_feedback_b",
        tenantId: B,
        rating: "down",
        comment: "Isolation fixture",
        conversation: [],
        actorEmail: "isolation-b@test",
      },
    });
    await owner.feedbackLinearLink.upsert({
      where: { id: "isov_linear_link_a" },
      update: {},
      create: {
        id: "isov_linear_link_a",
        tenantId: A,
        ticketId: "isov_linear_ticket_a1",
        linearIssueKey: "WIN-ISO-1",
        linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-1/demo-fixture",
        linkedByUserId: "isov_voice_user_a",
      },
    });
    await owner.feedbackLinearLink.upsert({
      where: { id: "isov_linear_link_b" },
      update: {},
      create: {
        id: "isov_linear_link_b",
        tenantId: B,
        assistantFeedbackId: "isov_linear_feedback_b",
        linearIssueKey: "WIN-ISO-2",
        linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-2/isolation-fixture",
        linkedByUserId: "isov_voice_user_b",
      },
    });
    await owner.user.upsert({ where: { id: "isov_voice_user_a" }, update: {}, create: { id: "isov_voice_user_a", name: "Voice A", email: "isov_voice_a@test" } });
    await owner.user.upsert({ where: { id: "isov_voice_user_b" }, update: {}, create: { id: "isov_voice_user_b", name: "Voice B", email: "isov_voice_b@test" } });
    // #90: org memberships so the app-layer user-management scoping (User/Member are GLOBAL, no RLS)
    // can be exercised — user A is a member of org A, user B a member of org B.
    await owner.member.upsert({ where: { organizationId_userId: { organizationId: A, userId: "isov_voice_user_a" } }, update: {}, create: { organizationId: A, userId: "isov_voice_user_a", role: "member" } });
    await owner.member.upsert({ where: { organizationId_userId: { organizationId: B, userId: "isov_voice_user_b" } }, update: {}, create: { organizationId: B, userId: "isov_voice_user_b", role: "member" } });
    const now = new Date();
    await owner.lot.upsert({ where: { id: "isov_a" }, update: {}, create: { id: "isov_a", code: "ISOV-A", tenantId: A, updatedAt: now } });
    await owner.lot.upsert({ where: { id: "isov_b" }, update: {}, create: { id: "isov_b", code: "ISOV-B", tenantId: B, updatedAt: now } });
    // Raw-SQL isolation fixtures (plan 029): a vineyard+block+brix_log per tenant so the affected
    // getLatestBrixByBlock DISTINCT-ON raw read can be exercised under RLS.
    await owner.vineyard.upsert({ where: { id: "isov_vy_a" }, update: {}, create: { id: "isov_vy_a", name: "ISOV VY A", tenantId: A } });
    await owner.vineyard.upsert({ where: { id: "isov_vy_b" }, update: {}, create: { id: "isov_vy_b", name: "ISOV VY B", tenantId: B } });
    await owner.vineyardBlock.upsert({ where: { id: "isov_blk_a" }, update: {}, create: { id: "isov_blk_a", vineyardId: "isov_vy_a", tenantId: A, updatedAt: now } });
    await owner.vineyardBlock.upsert({ where: { id: "isov_blk_b" }, update: {}, create: { id: "isov_blk_b", vineyardId: "isov_vy_b", tenantId: B, updatedAt: now } });
    await owner.brixLog.upsert({ where: { id: "isov_brix_a" }, update: {}, create: { id: "isov_brix_a", blockId: "isov_blk_a", vineyardId: "isov_vy_a", brixValue: "22.5", createdByEmail: "iso@test", tenantId: A } });
    await owner.brixLog.upsert({ where: { id: "isov_brix_b" }, update: {}, create: { id: "isov_brix_b", blockId: "isov_blk_b", vineyardId: "isov_vy_b", brixValue: "23.5", createdByEmail: "iso@test", tenantId: B } });
    // Phase 14 compliance tables (checklist item 9).
    const period = { periodStart: now, periodEnd: now, onHandEnd: {}, computed: {}, overrides: {} };
    await owner.complianceReport.upsert({ where: { id: "isov_rep_a" }, update: {}, create: { id: "isov_rep_a", tenantId: A, updatedAt: now, ...period } });
    await owner.complianceReport.upsert({ where: { id: "isov_rep_b" }, update: {}, create: { id: "isov_rep_b", tenantId: B, updatedAt: now, ...period } });
    // Phase 9 Work Order tables (checklist item 9).
    await owner.workOrder.upsert({ where: { id: "isov_wo_a" }, update: {}, create: { id: "isov_wo_a", tenantId: A, number: 91001, title: "ISOV WO A", updatedAt: now } });
    await owner.workOrder.upsert({ where: { id: "isov_wo_b" }, update: {}, create: { id: "isov_wo_b", tenantId: B, number: 91002, title: "ISOV WO B", updatedAt: now } });
    // Phase 9.1 vessel-activity tables (checklist item 9).
    await owner.vessel.upsert({ where: { id: "isov_vessel_b" }, update: {}, create: { id: "isov_vessel_b", tenantId: B, code: "ISOV-TANK-B", type: "TANK", capacityL: "1000", updatedAt: now } });
    await owner.vesselActivityEvent.upsert({ where: { id: "isov_vae_b" }, update: {}, create: { id: "isov_vae_b", tenantId: B, vesselId: "isov_vessel_b", kind: "SANITIZE", enteredByEmail: "iso@test", commandId: "isov-vae-cmd-b" } });
    // Plan 040 PR2 CalculationLog (checklist item 9): one calc-log row per tenant. Append-only —
    // proven below by an app_rls UPDATE/DELETE being rejected at the privilege level.
    const calc = { calculatorId: "so2-kmbs", formulaId: "so2-kmbs", section: "SO₂ Additions", inputs: {}, output: {}, unitsUsed: {}, source: "PAGE" as const, engineVersion: "1.0.0" };
    await owner.calculationLog.upsert({ where: { id: "isov_calc_a" }, update: {}, create: { id: "isov_calc_a", tenantId: A, userId: "isov_user_a", userEmail: "iso@test", ...calc } });
    await owner.calculationLog.upsert({ where: { id: "isov_calc_b" }, update: {}, create: { id: "isov_calc_b", tenantId: B, userId: "isov_user_b", userEmail: "iso@test", ...calc } });
    // Phase 1 identity-presentation tables (checklist item 9): naming_template(+version), lot_identifier,
    // lot_code_event. lot_identifier/lot_code_event carry a composite (tenantId, lotId) FK to lot.
    await owner.namingTemplate.upsert({ where: { id: "isov_nt_a" }, update: {}, create: { id: "isov_nt_a", tenantId: A, code: "isov-nt", name: "ISOV NT A", updatedAt: now } });
    await owner.namingTemplate.upsert({ where: { id: "isov_nt_b" }, update: {}, create: { id: "isov_nt_b", tenantId: B, code: "isov-nt", name: "ISOV NT B", updatedAt: now } });
    await owner.namingTemplateVersion.upsert({ where: { id: "isov_ntv_b" }, update: {}, create: { id: "isov_ntv_b", tenantId: B, templateId: "isov_nt_b", version: 1, spec: {} } });
    await owner.lotIdentifier.upsert({ where: { id: "isov_li_a" }, update: {}, create: { id: "isov_li_a", tenantId: A, lotId: "isov_a", kind: "current-code", value: "ISOV-A", isCurrent: true, updatedAt: now } });
    await owner.lotIdentifier.upsert({ where: { id: "isov_li_b" }, update: {}, create: { id: "isov_li_b", tenantId: B, lotId: "isov_b", kind: "current-code", value: "ISOV-B", isCurrent: true, updatedAt: now } });
    await owner.lotCodeEvent.upsert({ where: { id: "isov_lce_b" }, update: {}, create: { id: "isov_lce_b", tenantId: B, lotId: "isov_b", field: "code", toValue: "ISOV-B2", commandId: "isov-lce-cmd-b" } });
    // Phase 2 (BOND-1 / TAXCLASS-1): a bond per tenant + a change_of_tax_class_event in B (composite
    // (tenantId, lotId) FK to lot).
    await owner.bond.upsert({ where: { id: "isov_bond_a" }, update: {}, create: { id: "isov_bond_a", tenantId: A, registryNumber: "ISOV-BOND-A", isPrimary: true, updatedAt: now } });
    await owner.bond.upsert({ where: { id: "isov_bond_b" }, update: {}, create: { id: "isov_bond_b", tenantId: B, registryNumber: "ISOV-BOND-B", isPrimary: true, updatedAt: now } });
    await owner.changeOfTaxClassEvent.upsert({ where: { id: "isov_ctc_b" }, update: {}, create: { id: "isov_ctc_b", tenantId: B, lotId: "isov_b", toClass: "A_LE16", observedAt: now, commandId: "isov-ctc-cmd-b" } });
    // Voice Focus tables: per-user tenant-scoped biometric preference/profile rows.
    const voiceProfile = { status: "ACTIVE" as const, provider: "LOCAL_VOICEPRINT" as const, modelVersion: "test", embeddingCt: "ct", dekWrapped: "dek", consentAcceptedAt: now, consentVersion: "test" };
    await owner.voiceProfile.upsert({ where: { id: "isov_voice_profile_a" }, update: {}, create: { id: "isov_voice_profile_a", tenantId: A, userId: "isov_voice_user_a", ...voiceProfile } });
    await owner.voiceProfile.upsert({ where: { id: "isov_voice_profile_b" }, update: {}, create: { id: "isov_voice_profile_b", tenantId: B, userId: "isov_voice_user_b", ...voiceProfile } });
    await owner.voicePreference.upsert({ where: { id: "isov_voice_pref_a" }, update: {}, create: { id: "isov_voice_pref_a", tenantId: A, userId: "isov_voice_user_a", defaultFocusMode: "MY_VOICE" } });
    await owner.voicePreference.upsert({ where: { id: "isov_voice_pref_b" }, update: {}, create: { id: "isov_voice_pref_b", tenantId: B, userId: "isov_voice_user_b", defaultFocusMode: "MY_VOICE" } });
  });

  afterAll(async () => {
    await owner.feedbackLinearLink.deleteMany({
      where: {
        id: {
          in: [
            "isov_linear_link_a",
            "isov_linear_link_b",
            "isov_linear_link_shared",
            "isov_linear_link_cross",
            "isov_linear_link_both",
            "isov_linear_link_neither",
            "isov_linear_link_duplicate",
          ],
        },
      },
    });
    await owner.feedbackTicket.deleteMany({
      where: { id: { in: ["isov_linear_ticket_a1", "isov_linear_ticket_a2", "isov_linear_ticket_b"] } },
    });
    await owner.assistantFeedback.deleteMany({
      where: { id: { in: ["isov_linear_feedback_a", "isov_linear_feedback_b"] } },
    });
    await owner.lotCodeEvent.deleteMany({ where: { id: { in: ["isov_lce_b"] } } });
    await owner.lotIdentifier.deleteMany({ where: { id: { in: ["isov_li_a", "isov_li_b", "isov_li_x", "isov_li_k11"] } } });
    await owner.changeOfTaxClassEvent.deleteMany({ where: { id: { in: ["isov_ctc_b", "isov_ctc_k11"] } } }); // Phase 2: FK'd to lot
    await owner.namingTemplateVersion.deleteMany({ where: { id: "isov_ntv_b" } });
    await owner.namingTemplate.deleteMany({ where: { id: { in: ["isov_nt_a", "isov_nt_b"] } } });
    await owner.calculationLog.deleteMany({ where: { id: { in: ["isov_calc_a", "isov_calc_b"] } } });
    await owner.vesselActivityEvent.deleteMany({ where: { id: { in: ["isov_vae_b", "isov_vae_x"] } } });
    await owner.vessel.deleteMany({ where: { id: "isov_vessel_b" } });
    await owner.workOrder.deleteMany({ where: { id: { in: ["isov_wo_a", "isov_wo_b", "isov_wo_x"] } } });
    await owner.complianceReport.deleteMany({ where: { id: { in: ["isov_rep_a", "isov_rep_b"] } } });
    await owner.brixLog.deleteMany({ where: { id: { in: ["isov_brix_a", "isov_brix_b"] } } });
    await owner.vineyardBlock.deleteMany({ where: { id: { in: ["isov_blk_a", "isov_blk_b"] } } });
    await owner.vineyard.deleteMany({ where: { id: { in: ["isov_vy_a", "isov_vy_b"] } } });
    await owner.lot.deleteMany({ where: { id: { in: ["isov_a", "isov_b"] } } });
    await owner.bond.deleteMany({ where: { id: { in: ["isov_bond_a", "isov_bond_b", "isov_bond_x"] } } }); // Phase 2: FK'd to org
    await owner.voicePreference.deleteMany({ where: { id: { in: ["isov_voice_pref_a", "isov_voice_pref_b", "isov_voice_pref_x"] } } });
    await owner.voiceProfile.deleteMany({ where: { id: { in: ["isov_voice_profile_a", "isov_voice_profile_b", "isov_voice_profile_x"] } } });
    await owner.member.deleteMany({ where: { userId: { in: ["isov_voice_user_a", "isov_voice_user_b"] } } });
    await owner.user.deleteMany({ where: { id: { in: ["isov_voice_user_a", "isov_voice_user_b"] } } });
    await owner.organization.deleteMany({ where: { id: B } });
    await app.$disconnect();
    await owner.$disconnect();
  });

  it("app connects as a NOBYPASSRLS non-superuser role", async () => {
    const [r] = await app.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(r.rolbypassrls).toBe(false);
    expect(r.rolsuper).toBe(false);
  });

  it("no context -> 0 rows (fail-closed)", async () => {
    expect(await app.lot.count()).toBe(0);
    expect(await app.feedbackLinearLink.count()).toBe(0);
  });

  it("feedback_linear_link is tenant-isolated and enforces parent/link invariants", async () => {
    expect(
      await asTenant(A, (db) => db.feedbackLinearLink.findFirst({ where: { id: "isov_linear_link_a" } })),
    ).not.toBeNull();
    expect(
      await asTenant(A, (db) => db.feedbackLinearLink.findFirst({ where: { id: "isov_linear_link_b" } })),
    ).toBeNull();

    await expect(
      asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "isov_linear_link_cross",
            tenantId: A,
            ticketId: "isov_linear_ticket_b",
            linearIssueKey: "WIN-ISO-X",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-X/cross-tenant",
            linkedByUserId: "isov_voice_user_a",
          },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "isov_linear_link_both",
            tenantId: A,
            ticketId: "isov_linear_ticket_a2",
            assistantFeedbackId: "isov_linear_feedback_a",
            linearIssueKey: "WIN-ISO-BOTH",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-BOTH/both-parents",
            linkedByUserId: "isov_voice_user_a",
          },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "isov_linear_link_neither",
            tenantId: A,
            linearIssueKey: "WIN-ISO-NONE",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-NONE/no-parent",
            linkedByUserId: "isov_voice_user_a",
          },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "isov_linear_link_duplicate",
            tenantId: A,
            ticketId: "isov_linear_ticket_a1",
            linearIssueKey: "WIN-ISO-DUP",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-DUP/duplicate",
            linkedByUserId: "isov_voice_user_a",
          },
        }),
      ),
    ).rejects.toThrow();

    const shared = await asTenant(A, (db) =>
      db.feedbackLinearLink.create({
        data: {
          id: "isov_linear_link_shared",
          tenantId: A,
          ticketId: "isov_linear_ticket_a2",
          linearIssueKey: "WIN-ISO-1",
          linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-1/demo-fixture",
          linkedByUserId: "isov_voice_user_a",
        },
      }),
    );
    expect(shared.linearIssueKey).toBe("WIN-ISO-1");
  });

  it("tenant A sees its own lot but not tenant B's", async () => {
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_b" } }))).toBeNull();
  });

  it("cross-tenant UPDATE/DELETE affect 0 rows", async () => {
    expect((await asTenant(A, (db) => db.lot.updateMany({ where: { id: "isov_b" }, data: { note: "x" } }))).count).toBe(0);
    expect((await asTenant(A, (db) => db.lot.deleteMany({ where: { id: "isov_b" } }))).count).toBe(0);
  });

  it("foreign-tenant INSERT raises (WITH CHECK)", async () => {
    await expect(
      asTenant(A, (db) => db.lot.create({ data: { id: "isov_x", code: "ISOV-X", tenantId: B, updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("compliance_report is tenant-isolated (Phase 14): A sees its own, not B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.complianceReport.findFirst({ where: { id: "isov_rep_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.complianceReport.findFirst({ where: { id: "isov_rep_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.complianceReport.create({ data: { id: "isov_rep_x", tenantId: B, periodStart: new Date(), periodEnd: new Date(), onHandEnd: {}, computed: {}, overrides: {}, updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("raw $queryRaw respects app.tenant_id (plan 029 — the raw path the extension does NOT intercept)", async () => {
    // As A, a raw select over both lots returns ONLY A's row (RLS scopes the raw read via the GUC).
    const aRows = await asTenant(A, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('isov_a', 'isov_b')`);
    expect(aRows.map((r) => r.id)).toEqual(["isov_a"]);
    // With NO context, a raw read sees nothing — this is the silent-empty the unwrapped $queryRaw caused in prod.
    const noCtx = await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('isov_a', 'isov_b')`;
    expect(noCtx).toHaveLength(0);
  });

  it("brix_log raw DISTINCT-ON read is tenant-isolated (plan 029 — getLatestBrixByBlock path)", async () => {
    // The getLatestBrixByBlock query shape, as A over A's vineyard: returns A's block only.
    const aRows = await asTenant(A, (tx) => tx.$queryRaw<{ blockId: string }[]>`
      SELECT DISTINCT ON ("blockId") "blockId" FROM "brix_log" WHERE "vineyardId" = 'isov_vy_a' ORDER BY "blockId", "recordedAt" DESC, "id" DESC`);
    expect(aRows.map((r) => r.blockId)).toEqual(["isov_blk_a"]);
    // As A, querying B's vineyard returns nothing (RLS invisibility on the raw read).
    const aSeesB = await asTenant(A, (tx) => tx.$queryRaw<{ blockId: string }[]>`SELECT "blockId" FROM "brix_log" WHERE "vineyardId" = 'isov_vy_b'`);
    expect(aSeesB).toHaveLength(0);
  });

  it("pooler no-bleed: SET LOCAL tenant context does not survive a committed tx on a reused connection (D17/H1)", async () => {
    // The catastrophic multi-tenant failure a direct-Postgres proof can't catch: a transaction-mode
    // pooler hands the SAME physical server connection to the next client without resetting session
    // state. Because tenant context is set with SET LOCAL (set_config(app.tenant_id, ..., true)), it is
    // scoped to the transaction and cleared on COMMIT — so a following no-context op on the reused
    // connection must be fail-closed. If this ever regressed to a session-scoped SET, tenant A's id
    // would persist on the pooled connection and the assertions below would see A's row.
    // (In CI this connection is PgBouncer with default_pool_size=1, guaranteeing the reuse.)
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_a" } }))).not.toBeNull(); // visible INSIDE the tx
    expect(await app.lot.count()).toBe(0); // ...gone immediately after commit, on the reused connection
    // The raw path (which the tenant extension does not wrap) is likewise fail-closed on that connection.
    expect(await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" = 'isov_a'`).toHaveLength(0);
  });

  it("composite-FK cross-tenant reference rejected (K11)", async () => {
    await expect(
      asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "isov_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      }),
    ).rejects.toThrow();
  });

  it("identity-presentation tables tenant-isolated (Phase 1): A can't see B's rows; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.lotIdentifier.findFirst({ where: { id: "isov_li_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.lotIdentifier.findFirst({ where: { id: "isov_li_b" } }))).toBeNull();
    expect(await asTenant(A, (db) => db.namingTemplate.findFirst({ where: { id: "isov_nt_b" } }))).toBeNull();
    expect(await asTenant(A, (db) => db.lotCodeEvent.findFirst({ where: { id: "isov_lce_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.lotIdentifier.create({ data: { id: "isov_li_x", tenantId: B, lotId: "isov_b", kind: "current-code", value: "X", updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("lot_identifier composite-FK cross-tenant reference rejected (K11) + backfill lands on the right tenant (E4)", async () => {
    // As A, pointing a lot_identifier at B's lot: composite (tenantId,lotId)->lot(tenantId,id) has no
    // (A, isov_b) target, and WITH CHECK rejects a B-tenant row — either way it must throw.
    await expect(
      asTenant(A, (db) => db.lotIdentifier.create({ data: { id: "isov_li_k11", tenantId: A, lotId: "isov_b", kind: "prior-code", value: "K11", updatedAt: new Date() } })),
    ).rejects.toThrow();
    // The seeded current-code row for A's lot is visible to A and correctly tenant-stamped.
    const li = await asTenant(A, (db) => db.lotIdentifier.findFirst({ where: { id: "isov_li_a" }, select: { tenantId: true, lotId: true } }));
    expect(li).toMatchObject({ tenantId: A, lotId: "isov_a" });
  });

  it("bond + change_of_tax_class_event tenant-isolated (Phase 2): A can't see B's; foreign INSERT + composite-FK rejected", async () => {
    expect(await asTenant(A, (db) => db.bond.findFirst({ where: { id: "isov_bond_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.bond.findFirst({ where: { id: "isov_bond_b" } }))).toBeNull();
    expect(await asTenant(A, (db) => db.changeOfTaxClassEvent.findFirst({ where: { id: "isov_ctc_b" } }))).toBeNull();
    // Foreign-tenant bond INSERT → WITH CHECK rejects.
    await expect(
      asTenant(A, (db) => db.bond.create({ data: { id: "isov_bond_x", tenantId: B, registryNumber: "ISOV-BOND-X", updatedAt: new Date() } })),
    ).rejects.toThrow();
    // Change-of-tax-class event pointing at B's lot → composite (tenantId, lotId) FK reject (K11).
    await expect(
      asTenant(A, (db) => db.changeOfTaxClassEvent.create({ data: { id: "isov_ctc_k11", tenantId: A, lotId: "isov_b", toClass: "A_LE16", observedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("voice_profile + voice_preference are tenant-isolated: A cannot see B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.voiceProfile.findFirst({ where: { id: "isov_voice_profile_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.voiceProfile.findFirst({ where: { id: "isov_voice_profile_b" } }))).toBeNull();
    expect(await asTenant(A, (db) => db.voicePreference.findFirst({ where: { id: "isov_voice_pref_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.voiceProfile.create({
        data: {
          id: "isov_voice_profile_x",
          tenantId: B,
          userId: "isov_voice_user_a",
          status: "ACTIVE",
          provider: "LOCAL_VOICEPRINT",
          modelVersion: "test",
        },
      })),
    ).rejects.toThrow();
    await expect(
      asTenant(A, (db) => db.voicePreference.create({
        data: { id: "isov_voice_pref_x", tenantId: B, userId: "isov_voice_user_a", defaultFocusMode: "MY_VOICE" },
      })),
    ).rejects.toThrow();
  });

  it("work_order is tenant-isolated (Phase 9): A sees its own, not B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.workOrder.findFirst({ where: { id: "isov_wo_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.workOrder.findFirst({ where: { id: "isov_wo_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.workOrder.create({ data: { id: "isov_wo_x", tenantId: B, number: 91003, title: "ISOV WO X", updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("vessel_activity_event is tenant-isolated (Phase 9.1): A cannot see B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.vesselActivityEvent.findFirst({ where: { id: "isov_vae_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.vesselActivityEvent.create({ data: { id: "isov_vae_x", tenantId: B, vesselId: "isov_vessel_b", kind: "CLEAN", enteredByEmail: "iso@test", commandId: "isov-vae-cmd-x" } })),
    ).rejects.toThrow();
  });

  it("calculation_log is tenant-isolated + append-only (plan 040): A sees its own not B's; foreign INSERT rejected; UPDATE/DELETE denied", async () => {
    expect(await asTenant(A, (db) => db.calculationLog.findFirst({ where: { id: "isov_calc_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.calculationLog.findFirst({ where: { id: "isov_calc_b" } }))).toBeNull();
    // WITH CHECK: inserting a foreign tenantId while in A is rejected.
    await expect(
      asTenant(A, (db) => db.calculationLog.create({ data: { id: "isov_calc_x", tenantId: B, userId: "u", userEmail: "iso@test", calculatorId: "so2-kmbs", formulaId: "so2-kmbs", section: "SO₂ Additions", inputs: {}, output: {}, unitsUsed: {}, source: "PAGE", engineVersion: "1.0.0" } })),
    ).rejects.toThrow();
    // DB-enforced append-only: app_rls has UPDATE/DELETE REVOKEd, so even A's own row can't be mutated.
    await expect(asTenant(A, (db) => db.calculationLog.update({ where: { id: "isov_calc_a" }, data: { section: "hacked" } }))).rejects.toThrow();
    await expect(asTenant(A, (db) => db.calculationLog.delete({ where: { id: "isov_calc_a" } }))).rejects.toThrow();
  });

  // Coverage guard (checklist steps 6 + 9): EVERY non-global model must have RLS enabled + FORCED
  // and a tenant_isolation policy. Enumerated from Prisma's datamodel so a table added without its
  // RLS migration fails here — covers the newer Phase-8/14/reminder tables and every future one,
  // without a per-table fixture that would itself go stale. Read-only (config assertion).
  it("user management is app-layer tenant-scoped (#90): membership WHERE excludes cross-tenant users", async () => {
    // User/Member are GLOBAL (denylist, no RLS) so the DB won't scope them — the membership WHERE in
    // src/lib/users/scope.ts is the ONLY isolation. Exercised against the DB via the owner client
    // (RLS is irrelevant here); if `tenantUserWhere` ever regressed to a bare id lookup, the 2nd and
    // 4th assertions below would flip.
    expect(await owner.user.findFirst({ where: tenantUserWhere("isov_voice_user_a", A) })).not.toBeNull();
    expect(await owner.user.findFirst({ where: tenantUserWhere("isov_voice_user_b", A) })).toBeNull(); // B's user, as A → invisible
    const listA = (await owner.user.findMany({ where: memberOfTenant(A), select: { id: true } })).map((u) => u.id);
    expect(listA).toContain("isov_voice_user_a");
    expect(listA).not.toContain("isov_voice_user_b");
  });

  it("every non-global table has RLS enabled + forced + a tenant_isolation policy (steps 6/9)", async () => {
    const expected = Prisma.dmmf.datamodel.models
      .filter((m) => !GLOBAL_MODELS.has(m.name))
      .map((m) => m.dbName ?? m.name);
    const rows = await owner.$queryRaw<{ relname: string; rls: boolean; forced: boolean; has_policy: boolean }[]>`
      SELECT c.relname,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS forced,
             EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (${Prisma.join(expected)})`;
    const byName = new Map(rows.map((r) => [r.relname, r]));
    const missing = expected.filter((t) => {
      const r = byName.get(t);
      return !r || !r.rls || !r.forced || !r.has_policy;
    });
    expect(missing, `tables missing RLS/forced/policy: ${missing.join(", ") || "(none)"}`).toEqual([]);
  });
});
