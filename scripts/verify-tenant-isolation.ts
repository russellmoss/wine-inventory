/**
 * Phase 12 EXIT PROOF — cross-tenant isolation, exercised AS THE non-owner app_rls role.
 *
 *   npx tsx --env-file=.env scripts/verify-tenant-isolation.ts
 *
 * Two clients:
 *   owner  = DATABASE_URL_UNPOOLED (BYPASSRLS) — sets up + tears down cross-tenant fixtures.
 *   app    = DATABASE_URL_APP      (app_rls, NOBYPASSRLS) — the client under test; RLS applies.
 *
 * Tenant A = Demo Winery (sandbox). Tenant B = a throwaway org created for the run and deleted after.
 * Every assertion is what a real request would do; a leak makes the script exit non-zero.
 *
 * TEETH: this only has teeth because `app` connects as app_rls. Point DATABASE_URL_APP at the
 * OWNER (BYPASSRLS) instead and the cross-tenant reads would return rows -> the script FAILS,
 * proving it actually tests the boundary (see the role-attribute check below).
 */
import { PrismaClient, Prisma } from "@prisma/client";

const A = "org_demo_winery";
const B = "org_isolation_test_b";

// GLOBAL_MODELS (mirror of src/lib/tenant/models.ts): the Better Auth core + org-plugin tables plus the
// Plan-073 FxRate reference cache are the ONLY non-tenant tables — every other model must be RLS-isolated.
// FxRate has no tenantId (ECB rates are the same for everyone); it's excluded from the RLS coverage guard
// below exactly like the auth globals. Inlined so this exit-proof script stays self-contained.
const GLOBAL_MODELS = new Set(["User", "Session", "Account", "Verification", "Organization", "Member", "Invitation", "FxRate"]);

const OWNER_URL = process.env.DATABASE_URL_UNPOOLED;
const APP_URL = process.env.DATABASE_URL_APP;
if (!OWNER_URL) throw new Error("DATABASE_URL_UNPOOLED (owner) required.");
if (!APP_URL) throw new Error("DATABASE_URL_APP (app_rls) required — run scripts/setup-app-rls-credential.ts first.");

const owner = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
const app = new PrismaClient({ datasources: { db: { url: APP_URL } } });

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}

/** Run fn as app_rls with the tenant GUC set for the transaction (mirrors the app extension). The
 * interactive-tx timeout is lifted well above Prisma's 5s default (env-overridable) so a high-latency
 * link — airplane wifi, or a Neon cold-start with ~1s round-trips — doesn't expire the positive-control
 * tx mid-run (P2028). */
const VERIFY_TX_TIMEOUT_MS = Number(process.env.VERIFY_TX_TIMEOUT_MS) || 120_000;
function asTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return app.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: VERIFY_TX_TIMEOUT_MS, maxWait: VERIFY_TX_TIMEOUT_MS },
  );
}

async function main() {
  // Sanity: the app client MUST be a non-owner, NOBYPASSRLS role (or the whole proof is a no-op).
  const attrs = await app.$queryRaw<{ current_user: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
    SELECT current_user, r.rolbypassrls, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user`;
  check("app connects as a NOBYPASSRLS, non-superuser role", !!attrs[0] && !attrs[0].rolbypassrls && !attrs[0].rolsuper, `current_user=${attrs[0]?.current_user}`);

  // ── Coverage guard (checklist steps 6 + 9): EVERY non-global model must have RLS ENABLED +
  //    FORCED and a `tenant_isolation` policy. Enumerated from Prisma's datamodel (minus the auth
  //    globals), so a table added WITHOUT its RLS migration fails here — the exact regression a
  //    hand-maintained per-table fixture list would silently miss as the schema grows. Read-only. ──
  const expectedTables = Prisma.dmmf.datamodel.models
    .filter((m) => !GLOBAL_MODELS.has(m.name))
    .map((m) => m.dbName ?? m.name);
  const rlsRows = await owner.$queryRaw<{ relname: string; rls: boolean; forced: boolean; has_policy: boolean }[]>`
    SELECT c.relname,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS has_policy
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (${Prisma.join(expectedTables)})`;
  const rlsByName = new Map(rlsRows.map((r) => [r.relname, r]));
  const rlsMissing = expectedTables.filter((t) => {
    const r = rlsByName.get(t);
    return !r || !r.rls || !r.forced || !r.has_policy;
  });
  check(`all ${expectedTables.length} non-global tables have RLS enabled+forced+tenant_isolation policy (steps 6/9)`, rlsMissing.length === 0, rlsMissing.length ? `missing/incomplete: ${rlsMissing.join(", ")}` : "");

  // ── Setup (owner, bypasses RLS): Demo Winery + tenant B fixtures. ──
  // Tenant A is always the Demo Winery sandbox. Create it on a fresh CI DB; never write isolation
  // fixtures into Bhutan Wine Co.
  await owner.organization.upsert({ where: { id: A }, update: {}, create: { id: A, name: "Demo Winery", slug: "demo-winery" } });
  await owner.organization.upsert({ where: { id: B }, update: {}, create: { id: B, name: "Isolation Test B", slug: B } });
  await owner.feedbackLinearLink.deleteMany({
    where: {
      id: {
        in: [
          "iso_linear_link_shared",
          "iso_linear_link_cross",
          "iso_linear_link_both",
          "iso_linear_link_neither",
          "iso_linear_link_duplicate",
        ],
      },
    },
  });
  await owner.feedbackTicket.upsert({
    where: { id: "iso_linear_ticket_a1" },
    update: {},
    create: {
      id: "iso_linear_ticket_a1",
      tenantId: A,
      kind: "FEATURE_REQUEST",
      title: "Linear isolation ticket A1",
      body: "Demo fixture",
      actorEmail: "isolation@demowinery.test",
      modeAtSubmission: "REPORT_ONLY",
    },
  });
  await owner.feedbackTicket.upsert({
    where: { id: "iso_linear_ticket_a2" },
    update: {},
    create: {
      id: "iso_linear_ticket_a2",
      tenantId: A,
      kind: "FEATURE_REQUEST",
      title: "Linear isolation ticket A2",
      body: "Demo fixture",
      actorEmail: "isolation@demowinery.test",
      modeAtSubmission: "REPORT_ONLY",
    },
  });
  await owner.feedbackTicket.upsert({
    where: { id: "iso_linear_ticket_b" },
    update: {},
    create: {
      id: "iso_linear_ticket_b",
      tenantId: B,
      kind: "FEATURE_REQUEST",
      title: "Linear isolation ticket B",
      body: "Isolation fixture",
      actorEmail: "isolation-b@test",
      modeAtSubmission: "REPORT_ONLY",
    },
  });
  await owner.assistantFeedback.upsert({
    where: { id: "iso_linear_feedback_a" },
    update: {},
    create: {
      id: "iso_linear_feedback_a",
      tenantId: A,
      rating: "down",
      comment: "Demo fixture",
      conversation: [],
      actorEmail: "isolation@demowinery.test",
    },
  });
  await owner.assistantFeedback.upsert({
    where: { id: "iso_linear_feedback_b" },
    update: {},
    create: {
      id: "iso_linear_feedback_b",
      tenantId: B,
      rating: "down",
      comment: "Isolation fixture",
      conversation: [],
      actorEmail: "isolation-b@test",
    },
  });
  await owner.feedbackLinearLink.upsert({
    where: { id: "iso_linear_link_a" },
    update: {},
    create: {
      id: "iso_linear_link_a",
      tenantId: A,
      ticketId: "iso_linear_ticket_a1",
      linearIssueKey: "WIN-ISO-1",
      linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-1/demo-fixture",
      linkedByUserId: "iso_um_user_a",
    },
  });
  await owner.feedbackLinearLink.upsert({
    where: { id: "iso_linear_link_b" },
    update: {},
    create: {
      id: "iso_linear_link_b",
      tenantId: B,
      assistantFeedbackId: "iso_linear_feedback_b",
      linearIssueKey: "WIN-ISO-2",
      linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-2/isolation-fixture",
      linkedByUserId: "iso_um_user_b",
    },
  });
  const now = new Date();
  // #90 app-layer user-management isolation: User/Member are GLOBAL (no RLS), so the membership WHERE
  // in the app layer (src/lib/users/scope.ts) is the ONLY tenant scope. Seed a user+member per tenant.
  await owner.user.upsert({ where: { id: "iso_um_user_a" }, update: {}, create: { id: "iso_um_user_a", name: "ISO User A", email: "iso_um_user_a@test" } });
  await owner.user.upsert({ where: { id: "iso_um_user_b" }, update: {}, create: { id: "iso_um_user_b", name: "ISO User B", email: "iso_um_user_b@test" } });
  await owner.member.upsert({ where: { organizationId_userId: { organizationId: A, userId: "iso_um_user_a" } }, update: {}, create: { organizationId: A, userId: "iso_um_user_a", role: "member" } });
  await owner.member.upsert({ where: { organizationId_userId: { organizationId: B, userId: "iso_um_user_b" } }, update: {}, create: { organizationId: B, userId: "iso_um_user_b", role: "member" } });
  await owner.lot.upsert({ where: { id: "iso_lot_a" }, update: {}, create: { id: "iso_lot_a", code: "ISO-A", tenantId: A, updatedAt: now } });
  await owner.lot.upsert({ where: { id: "iso_lot_b" }, update: {}, create: { id: "iso_lot_b", code: "ISO-B", tenantId: B, updatedAt: now } });
  // Plan 029 raw-SQL fixtures: a vineyard+block+brix_log per tenant for the getLatestBrixByBlock path.
  await owner.vineyard.upsert({ where: { id: "iso_vy_a" }, update: {}, create: { id: "iso_vy_a", name: "ISO VY A", tenantId: A } });
  await owner.vineyard.upsert({ where: { id: "iso_vy_b" }, update: {}, create: { id: "iso_vy_b", name: "ISO VY B", tenantId: B } });
  await owner.vineyardBlock.upsert({ where: { id: "iso_blk_a" }, update: {}, create: { id: "iso_blk_a", vineyardId: "iso_vy_a", tenantId: A, updatedAt: now } });
  await owner.vineyardBlock.upsert({ where: { id: "iso_blk_b" }, update: {}, create: { id: "iso_blk_b", vineyardId: "iso_vy_b", tenantId: B, updatedAt: now } });
  await owner.brixLog.upsert({ where: { id: "iso_brix_a" }, update: {}, create: { id: "iso_brix_a", blockId: "iso_blk_a", vineyardId: "iso_vy_a", brixValue: "22.5", createdByEmail: "iso@test", tenantId: A } });
  await owner.brixLog.upsert({ where: { id: "iso_brix_b" }, update: {}, create: { id: "iso_brix_b", blockId: "iso_blk_b", vineyardId: "iso_vy_b", brixValue: "23.5", createdByEmail: "iso@test", tenantId: B } });
  // Phase 15: an accounting_connection (the token table) per tenant, plus a cost_export_event in A
  // (composite-FK target for the delivery-uniqueness check). DISCONNECTED + null tokens satisfies the
  // SEC-S5 CHECK; null realmId keeps the one-realm partial-unique out of the way.
  // Use XERO for tenant A so the fixture remains independent of any Demo QBO connection. Provider is
  // irrelevant to the isolation assertions; this row is a token-table stand-in + delivery-FK target.
  await owner.accountingConnection.upsert({ where: { id: "iso_acct_conn_a" }, update: {}, create: { id: "iso_acct_conn_a", tenantId: A, provider: "XERO", status: "DISCONNECTED", environment: "sandbox", updatedAt: now } });
  await owner.accountingConnection.upsert({ where: { id: "iso_acct_conn_b" }, update: {}, create: { id: "iso_acct_conn_b", tenantId: B, provider: "QBO", status: "DISCONNECTED", environment: "sandbox", updatedAt: now } });
  await owner.costExportEvent.upsert({ where: { id: "iso_cee_a" }, update: {}, create: { id: "iso_cee_a", tenantId: A, postingKey: "iso:cee:a", sourceType: "SNAPSHOT", component: "FRUIT", amount: "1.00", debitAccount: "5000", creditAccount: "1400" } });
  // Phase 16: a commerce7_connection + a sales_export_event per/into a tenant (the DTC seam). No token
  // columns here; the isolation risk is a cross-tenant read of a winery's sales/connection state.
  await owner.commerce7Connection.upsert({ where: { id: "iso_c7_conn_a" }, update: {}, create: { id: "iso_c7_conn_a", tenantId: A, provider: "COMMERCE7", status: "DISCONNECTED", environment: "sandbox", updatedAt: now } });
  await owner.commerce7Connection.upsert({ where: { id: "iso_c7_conn_b" }, update: {}, create: { id: "iso_c7_conn_b", tenantId: B, provider: "COMMERCE7", status: "DISCONNECTED", environment: "sandbox", updatedAt: now } });
  await owner.salesExportEvent.upsert({ where: { id: "iso_see_b" }, update: {}, create: { id: "iso_see_b", tenantId: B, postingKey: "iso:see:b", commerce7OrderId: "iso_ord_b", deltaSeq: 1, kind: "SALE", revenueDelta: "10.00", lineDeltas: [], accountingDate: now, occurredAt: now } });
  // Phase 9: a work_order + a work_order_task per/into a tenant (the WO seam). Isolation risk is a
  // cross-tenant read of a winery's scheduled work, and a cross-tenant task→lot composite-FK edge.
  await owner.workOrder.upsert({ where: { id: "iso_wo_a" }, update: {}, create: { id: "iso_wo_a", tenantId: A, number: 90001, title: "ISO WO A", updatedAt: now } });
  await owner.workOrder.upsert({ where: { id: "iso_wo_b" }, update: {}, create: { id: "iso_wo_b", tenantId: B, number: 90002, title: "ISO WO B", updatedAt: now } });
  await owner.workOrderTask.upsert({ where: { id: "iso_wot_b" }, update: {}, create: { id: "iso_wot_b", tenantId: B, workOrderId: "iso_wo_b", seq: 1, kind: "OBSERVATION", title: "ISO task B", plannedPayload: {}, updatedAt: now } });
  // Plan 053 A5/A7: a cross-order dependency edge in tenant B (iso_wo_b depends on iso_wo_bp). Isolation
  // risk is a cross-tenant read of a winery's WO graph, and an edge whose endpoints span tenants.
  await owner.workOrder.upsert({ where: { id: "iso_wo_bp" }, update: {}, create: { id: "iso_wo_bp", tenantId: B, number: 90005, title: "ISO WO B pred", updatedAt: now } });
  await owner.workOrderDependency.upsert({ where: { id: "iso_wodep_b" }, update: {}, create: { id: "iso_wodep_b", tenantId: B, workOrderId: "iso_wo_b", dependsOnWorkOrderId: "iso_wo_bp" } });
  // Plan 053 B10: an equipment asset + an advisory task↔equipment link in tenant B. Isolation risk is a
  // cross-tenant read of a winery's gear and a link whose endpoints span tenants.
  await owner.equipmentAsset.upsert({ where: { id: "iso_eq_b" }, update: {}, create: { id: "iso_eq_b", tenantId: B, name: "ISO Press B", kind: "press", updatedAt: now } });
  await owner.workOrderTaskEquipment.upsert({ where: { id: "iso_wote_b" }, update: {}, create: { id: "iso_wote_b", tenantId: B, taskId: "iso_wot_b", equipmentId: "iso_eq_b" } });
  // Plan 069: a vendor + a vendor_contact in tenant B. Isolation risk is a cross-tenant read of a winery's
  // suppliers/PII, and a contact/material/lot whose vendor spans tenants (composite (tenantId, vendorId) FK).
  await owner.vendor.upsert({ where: { id: "iso_vendor_b" }, update: {}, create: { id: "iso_vendor_b", tenantId: B, name: "ISO Vendor B", updatedAt: now } });
  await owner.vendorContact.upsert({ where: { id: "iso_vc_b" }, update: {}, create: { id: "iso_vc_b", tenantId: B, vendorId: "iso_vendor_b", name: "ISO Contact B", updatedAt: now } });
  // Plan 053 C11: a tenant-authored Custom Log type in tenant B. Isolation risk is a cross-tenant read of a
  // winery's custom task definitions.
  await owner.workOrderTaskType.upsert({ where: { id: "iso_wtt_b" }, update: {}, create: { id: "iso_wtt_b", tenantId: B, code: "ISO_LOG_B", label: "ISO Log B", fieldsJson: [{ key: "note", label: "Note", type: "text", stage: ["planning"] }] } });
  // Plan 053 C12: a built-in field overlay in tenant B.
  await owner.workOrderTaskTypeOverlay.upsert({ where: { id: "iso_ovl_b" }, update: {}, create: { id: "iso_ovl_b", tenantId: B, baseTaskType: "RACK", hiddenFields: ["note"], relabels: {}, fieldOrder: [] } });
  // Phase 9.1: a vessel + a vessel_activity_event per/into a tenant (the maintenance lane). Isolation risk
  // is a cross-tenant read of a winery's cleaning/setpoint activity + its overhead depletion ledger.
  await owner.vessel.upsert({ where: { id: "iso_vessel_b" }, update: {}, create: { id: "iso_vessel_b", tenantId: B, code: "ISO-TANK-B", type: "TANK", capacityL: "1000", updatedAt: now } });
  await owner.vesselActivityEvent.upsert({ where: { id: "iso_vae_b" }, update: {}, create: { id: "iso_vae_b", tenantId: B, vesselId: "iso_vessel_b", kind: "SANITIZE", enteredByEmail: "iso@test", commandId: "iso-vae-cmd-b" } });
  // Plan 040 PR2: a calculation_log row per tenant (append-only audit; the DB-enforced no-UPDATE/DELETE
  // is checked below via app_rls privilege denial).
  const calc = { calculatorId: "so2-kmbs", formulaId: "so2-kmbs", section: "SO₂ Additions", inputs: {}, output: {}, unitsUsed: {}, source: "PAGE" as const, engineVersion: "1.0.0" };
  await owner.calculationLog.upsert({ where: { id: "iso_calc_a" }, update: {}, create: { id: "iso_calc_a", tenantId: A, userId: "iso_user_a", userEmail: "iso@test", ...calc } });
  await owner.calculationLog.upsert({ where: { id: "iso_calc_b" }, update: {}, create: { id: "iso_calc_b", tenantId: B, userId: "iso_user_b", userEmail: "iso@test", ...calc } });
  // Phase 1 identity presentation: naming_template(+version), lot_identifier, lot_code_event. The
  // identifier/event carry a composite (tenantId, lotId) FK to lot (K11).
  await owner.namingTemplate.upsert({ where: { id: "iso_nt_a" }, update: {}, create: { id: "iso_nt_a", tenantId: A, code: "iso-nt", name: "ISO NT A", updatedAt: now } });
  await owner.namingTemplate.upsert({ where: { id: "iso_nt_b" }, update: {}, create: { id: "iso_nt_b", tenantId: B, code: "iso-nt", name: "ISO NT B", updatedAt: now } });
  await owner.namingTemplateVersion.upsert({ where: { id: "iso_ntv_b" }, update: {}, create: { id: "iso_ntv_b", tenantId: B, templateId: "iso_nt_b", version: 1, spec: {} } });
  await owner.lotIdentifier.upsert({ where: { id: "iso_li_a" }, update: {}, create: { id: "iso_li_a", tenantId: A, lotId: "iso_lot_a", kind: "current-code", value: "ISO-A", isCurrent: true, updatedAt: now } });
  await owner.lotIdentifier.upsert({ where: { id: "iso_li_b" }, update: {}, create: { id: "iso_li_b", tenantId: B, lotId: "iso_lot_b", kind: "current-code", value: "ISO-B", isCurrent: true, updatedAt: now } });
  await owner.lotCodeEvent.upsert({ where: { id: "iso_lce_b" }, update: {}, create: { id: "iso_lce_b", tenantId: B, lotId: "iso_lot_b", field: "code", toValue: "ISO-B2", commandId: "iso-lce-cmd-b" } });
  // Phase 2 (BOND-1 / TAXCLASS-1): a bond per tenant + a change_of_tax_class_event in B (composite
  // (tenantId, lotId) → lot FK, K11). Isolation risk is a cross-tenant read of a winery's bonds /
  // tax-class declarations, and a cross-tenant event→lot edge.
  await owner.bond.upsert({ where: { id: "iso_bond_a" }, update: {}, create: { id: "iso_bond_a", tenantId: A, registryNumber: "ISO-BOND-A", isPrimary: true, updatedAt: now } });
  await owner.bond.upsert({ where: { id: "iso_bond_b" }, update: {}, create: { id: "iso_bond_b", tenantId: B, registryNumber: "ISO-BOND-B", isPrimary: true, updatedAt: now } });
  await owner.changeOfTaxClassEvent.upsert({ where: { id: "iso_ctc_b" }, update: {}, create: { id: "iso_ctc_b", tenantId: B, lotId: "iso_lot_b", toClass: "A_LE16", observedAt: now, commandId: "iso-ctc-cmd-b" } });
  // Phase 3 migration kernel: a staged batch + children in tenant B. Isolation risk is a cross-tenant
  // read of draft migration evidence, and cross-tenant staged-position -> vessel/bond/lot edges.
  await owner.migrationImportBatch.upsert({
    where: { id: "iso_mig_batch_b" },
    update: {},
    create: { id: "iso_mig_batch_b", tenantId: B, sourceSystem: "iso-migration", status: "DRAFT", cutoverAt: now, sourceManifest: {}, updatedAt: now },
  });
  await owner.migrationSeedLot.upsert({
    where: { id: "iso_mig_lot_b" },
    update: {},
    create: { id: "iso_mig_lot_b", tenantId: B, importBatchId: "iso_mig_batch_b", sourceLotKey: "iso-source-lot-b", code: "ISO-MIG-B", form: "WINE", updatedAt: now },
  });
  await owner.migrationSeedPosition.upsert({
    where: { id: "iso_mig_pos_b" },
    update: {},
    create: { id: "iso_mig_pos_b", tenantId: B, importBatchId: "iso_mig_batch_b", seedLotId: "iso_mig_lot_b", sourcePositionKey: "iso-pos-b", sourceVesselKey: "iso-vessel-b", vesselId: "iso_vessel_b", vesselCode: "ISO-TANK-B", volumeL: "1.00", bondId: "iso_bond_b", updatedAt: now },
  });
  await owner.migrationReconciliationItem.upsert({
    where: { id: "iso_mig_rec_b" },
    update: {},
    create: { id: "iso_mig_rec_b", tenantId: B, importBatchId: "iso_mig_batch_b", kind: "FINISHED_GOODS", subjectType: "BATCH", subjectKey: "fg", label: "FG", severity: "WARNING", status: "OPEN", message: "coverage gap", updatedAt: now },
  });
  await owner.migrationFieldMapping.upsert({
    where: { id: "iso_mig_field_b" },
    update: {},
    create: { id: "iso_mig_field_b", tenantId: B, sourceSystem: "iso-migration", sourceDataset: "current-state", sourceObjectType: "position", sourceField: "volume", targetField: "volume", updatedAt: now },
  });
  await owner.migrationEntityMapping.upsert({
    where: { id: "iso_mig_entity_b" },
    update: {},
    create: { id: "iso_mig_entity_b", tenantId: B, sourceSystem: "iso-migration", sourceDataset: "current-state", sourceObjectType: "vessel", sourceKey: "iso-vessel-b", targetType: "vessel", targetId: "iso_vessel_b", updatedAt: now },
  });

  try {
    // 1. Fail-closed: no tenant context -> 0 rows.
    const noCtx = await app.lot.count();
    check("no context -> 0 rows (fail-closed)", noCtx === 0, `saw ${noCtx}`);
    const noCtxLinearLinks = await app.feedbackLinearLink.count();
    check(
      "feedback_linear_link with no context -> 0 rows (fail-closed)",
      noCtxLinearLinks === 0,
      `saw ${noCtxLinearLinks}`,
    );

    const aLinearLink = await asTenant(A, (db) =>
      db.feedbackLinearLink.findFirst({ where: { id: "iso_linear_link_a" } }),
    );
    check("Demo Winery sees its own feedback_linear_link", aLinearLink?.tenantId === A);
    const aSeesLinearLinkB = await asTenant(A, (db) =>
      db.feedbackLinearLink.findFirst({ where: { id: "iso_linear_link_b" } }),
    );
    check("Demo Winery CANNOT see tenant B's feedback_linear_link", aSeesLinearLinkB === null);

    let linearCrossTenantFkRaised = false;
    try {
      await asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "iso_linear_link_cross",
            tenantId: A,
            ticketId: "iso_linear_ticket_b",
            linearIssueKey: "WIN-ISO-X",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-X/cross-tenant",
            linkedByUserId: "iso_um_user_a",
          },
        }),
      );
    } catch {
      linearCrossTenantFkRaised = true;
    }
    check("feedback_linear_link cross-tenant parent FK rejected", linearCrossTenantFkRaised);

    let linearBothParentsRaised = false;
    try {
      await asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "iso_linear_link_both",
            tenantId: A,
            ticketId: "iso_linear_ticket_a2",
            assistantFeedbackId: "iso_linear_feedback_a",
            linearIssueKey: "WIN-ISO-BOTH",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-BOTH/both-parents",
            linkedByUserId: "iso_um_user_a",
          },
        }),
      );
    } catch {
      linearBothParentsRaised = true;
    }
    check("feedback_linear_link rejects both parents", linearBothParentsRaised);

    let linearNoParentRaised = false;
    try {
      await asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "iso_linear_link_neither",
            tenantId: A,
            linearIssueKey: "WIN-ISO-NONE",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-NONE/no-parent",
            linkedByUserId: "iso_um_user_a",
          },
        }),
      );
    } catch {
      linearNoParentRaised = true;
    }
    check("feedback_linear_link rejects neither parent", linearNoParentRaised);

    let duplicateLinearLinkRaised = false;
    try {
      await asTenant(A, (db) =>
        db.feedbackLinearLink.create({
          data: {
            id: "iso_linear_link_duplicate",
            tenantId: A,
            ticketId: "iso_linear_ticket_a1",
            linearIssueKey: "WIN-ISO-DUP",
            linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-DUP/duplicate",
            linkedByUserId: "iso_um_user_a",
          },
        }),
      );
    } catch {
      duplicateLinearLinkRaised = true;
    }
    check("feedback_linear_link rejects a second active link for one source", duplicateLinearLinkRaised);

    const sharedLinearIssue = await asTenant(A, (db) =>
      db.feedbackLinearLink.create({
        data: {
          id: "iso_linear_link_shared",
          tenantId: A,
          ticketId: "iso_linear_ticket_a2",
          linearIssueKey: "WIN-ISO-1",
          linearIssueUrl: "https://linear.app/wine-inventory/issue/WIN-ISO-1/demo-fixture",
          linkedByUserId: "iso_um_user_a",
        },
      }),
    );
    check(
      "two source items may share one Linear issue key",
      sharedLinearIssue.linearIssueKey === aLinearLink?.linearIssueKey,
    );

    // 2. As tenant A: sees A's lot, NOT B's (RLS invisibility on SELECT).
    const aSeesOwn = await asTenant(A, (db) => db.lot.findFirst({ where: { id: "iso_lot_a" } }));
    check("tenant A sees its own lot", !!aSeesOwn);
    const aSeesB = await asTenant(A, (db) => db.lot.findFirst({ where: { id: "iso_lot_b" } }));
    check("tenant A CANNOT see tenant B's lot (SELECT)", aSeesB === null);

    // 3. Cross-tenant UPDATE / DELETE affect 0 rows (row invisible).
    const upd = await asTenant(A, (db) => db.lot.updateMany({ where: { id: "iso_lot_b" }, data: { note: "hacked" } }));
    check("tenant A cross-tenant UPDATE affects 0 rows", upd.count === 0, `count=${upd.count}`);
    const del = await asTenant(A, (db) => db.lot.deleteMany({ where: { id: "iso_lot_b" } }));
    check("tenant A cross-tenant DELETE affects 0 rows", del.count === 0, `count=${del.count}`);

    // 4. WITH CHECK: inserting a foreign tenantId while in tenant A raises.
    let insertRaised = false;
    try {
      await asTenant(A, (db) => db.lot.create({ data: { id: "iso_lot_x", code: "ISO-X", tenantId: B, updatedAt: new Date() } }));
    } catch { insertRaised = true; }
    check("foreign-tenant INSERT raises (WITH CHECK)", insertRaised);

    // 5. Composite-FK cross-tenant reference rejected (K11): op in A referencing B's lot.
    let fkRaised = false;
    try {
      await asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "iso_lot_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      });
    } catch { fkRaised = true; }
    check("composite-FK cross-tenant reference rejected (K11)", fkRaised);

    // 5b. Phase 8: supply_lot isolation. Owner seeds a material + costed receipt in B; app-as-A must
    // not see B's stock, and a foreign-tenant supply_lot insert while in A is rejected (WITH CHECK).
    await owner.cellarMaterial.upsert({
      where: { id: "iso_mat_b" },
      update: {},
      create: { id: "iso_mat_b", tenantId: B, name: "ISO KMBS", normalizedKey: "ISOKMBS", kind: "SO2", isStockTracked: true },
    });
    await owner.supplyLot.upsert({
      where: { id: "iso_supply_b" },
      update: {},
      create: { id: "iso_supply_b", tenantId: B, materialId: "iso_mat_b", qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.05", updatedAt: now },
    });
    const aSeesSupplyB = await asTenant(A, (db) => db.supplyLot.findFirst({ where: { id: "iso_supply_b" } }));
    check("tenant A CANNOT see tenant B's supply_lot (RLS)", aSeesSupplyB === null);
    let supplyInsertRaised = false;
    try {
      await asTenant(A, (db) => db.supplyLot.create({ data: { id: "iso_supply_x", tenantId: B, materialId: "iso_mat_b", qtyReceived: 1, qtyRemaining: 1, stockUnit: "g", updatedAt: new Date() } }));
    } catch { supplyInsertRaised = true; }
    check("foreign-tenant supply_lot INSERT raises (WITH CHECK)", supplyInsertRaised);

    // 5c. Plan 029: RAW $queryRaw respects the tenant GUC. The tenant extension only intercepts model
    // ops, so an unwrapped raw read runs with no app.tenant_id and (under RLS) returns 0 rows. These
    // prove the runInTenantRawTx path scopes raw reads and that a context-less raw read is fail-closed.
    const rawA = await asTenant(A, (db) => db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('iso_lot_a', 'iso_lot_b')`);
    check("raw $queryRaw as A returns only A's lot", rawA.length === 1 && rawA[0]?.id === "iso_lot_a", `saw ${rawA.map((r) => r.id).join(",")}`);
    const rawNoCtx = await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('iso_lot_a', 'iso_lot_b')`;
    check("raw $queryRaw with no context -> 0 rows (fail-closed)", rawNoCtx.length === 0, `saw ${rawNoCtx.length}`);
    const brixA = await asTenant(A, (db) => db.$queryRaw<{ blockId: string }[]>`SELECT DISTINCT ON ("blockId") "blockId" FROM "brix_log" WHERE "vineyardId" = 'iso_vy_a' ORDER BY "blockId", "recordedAt" DESC, "id" DESC`);
    check("brix_log raw DISTINCT-ON as A returns A's block", brixA.length === 1 && brixA[0]?.blockId === "iso_blk_a");
    const brixASeesB = await asTenant(A, (db) => db.$queryRaw<{ blockId: string }[]>`SELECT "blockId" FROM "brix_log" WHERE "vineyardId" = 'iso_vy_b'`);
    check("brix_log raw read as A CANNOT see B's vineyard rows", brixASeesB.length === 0, `saw ${brixASeesB.length}`);

    // 5d. Phase 15: accounting_connection (the ENCRYPTED-TOKEN table) is tenant-isolated through the
    // pooled endpoint. This is the one that matters most — a leak here is a cross-tenant token read.
    const aSeesConnB = await asTenant(A, (db) => db.accountingConnection.findFirst({ where: { id: "iso_acct_conn_b" } }));
    check("tenant A CANNOT see tenant B's accounting_connection (RLS)", aSeesConnB === null);
    let connInsertRaised = false;
    try {
      await asTenant(A, (db) => db.accountingConnection.create({ data: { id: "iso_acct_conn_x", tenantId: B, provider: "QBO", status: "DISCONNECTED", environment: "sandbox", updatedAt: new Date() } }));
    } catch { connInsertRaised = true; }
    check("foreign-tenant accounting_connection INSERT raises (WITH CHECK)", connInsertRaised);

    // 5e. council C7: a component has at most ONE default mapping row (sentinel taxClass='*'). The old
    // NULL default could not be uniquely enforced; the second insert must now be rejected.
    let dupDefaultRaised = false;
    try {
      await asTenant(A, async (db) => {
        await db.accountMapping.create({ data: { id: "iso_map_1", tenantId: A, component: "FRUIT", taxClass: "*", debitAccount: "5000", creditAccount: "1400" } });
        await db.accountMapping.create({ data: { id: "iso_map_2", tenantId: A, component: "FRUIT", taxClass: "*", debitAccount: "5001", creditAccount: "1401" } });
      });
    } catch { dupDefaultRaised = true; }
    check("duplicate default account_mapping row rejected (single default — council C7)", dupDefaultRaised);

    // 5f. exactly one AccountingDelivery per cost export event (@@unique([tenantId, costExportEventId])).
    let dupDeliveryRaised = false;
    try {
      await asTenant(A, async (db) => {
        await db.accountingDelivery.create({ data: { id: "iso_del_1", tenantId: A, connectionId: "iso_acct_conn_a", costExportEventId: "iso_cee_a", objectType: "JournalEntry", updatedAt: new Date() } });
        await db.accountingDelivery.create({ data: { id: "iso_del_2", tenantId: A, connectionId: "iso_acct_conn_a", costExportEventId: "iso_cee_a", objectType: "JournalEntry", updatedAt: new Date() } });
      });
    } catch { dupDeliveryRaised = true; }
    check("second delivery for the same cost export event rejected (@@unique)", dupDeliveryRaised);

    // 5g. Phase 16: commerce7_connection + sales_export_event tenant isolation (the DTC seam).
    const aSeesC7ConnB = await asTenant(A, (db) => db.commerce7Connection.findFirst({ where: { id: "iso_c7_conn_b" } }));
    check("tenant A CANNOT see tenant B's commerce7_connection (RLS)", aSeesC7ConnB === null);
    const aSeesSeeB = await asTenant(A, (db) => db.salesExportEvent.findFirst({ where: { id: "iso_see_b" } }));
    check("tenant A CANNOT see tenant B's sales_export_event (RLS)", aSeesSeeB === null);
    let c7InsertRaised = false;
    try {
      await asTenant(A, (db) => db.commerce7Connection.create({ data: { id: "iso_c7_conn_x", tenantId: B, provider: "COMMERCE7", status: "DISCONNECTED", environment: "sandbox", updatedAt: new Date() } }));
    } catch { c7InsertRaised = true; }
    check("foreign-tenant commerce7_connection INSERT raises (WITH CHECK)", c7InsertRaised);

    // 5h. Phase 9: work_order + work_order_task tenant isolation (the WO seam).
    const aSeesWoB = await asTenant(A, (db) => db.workOrder.findFirst({ where: { id: "iso_wo_b" } }));
    check("tenant A CANNOT see tenant B's work_order (RLS)", aSeesWoB === null);
    const aSeesWotB = await asTenant(A, (db) => db.workOrderTask.findFirst({ where: { id: "iso_wot_b" } }));
    check("tenant A CANNOT see tenant B's work_order_task (RLS)", aSeesWotB === null);
    let woInsertRaised = false;
    try {
      await asTenant(A, (db) => db.workOrder.create({ data: { id: "iso_wo_x", tenantId: B, number: 90003, title: "ISO WO X", updatedAt: new Date() } }));
    } catch { woInsertRaised = true; }
    check("foreign-tenant work_order INSERT raises (WITH CHECK)", woInsertRaised);
    // A WO task in A referencing B's lot must be rejected by the composite (tenantId, lotId) FK (K11).
    let woFkRaised = false;
    try {
      await asTenant(A, async (db) => {
        const wo = await db.workOrder.create({ data: { id: "iso_wo_fk_a", tenantId: A, number: 90004, title: "ISO WO FK", updatedAt: new Date() } });
        await db.workOrderTask.create({ data: { id: "iso_wot_fk", tenantId: A, workOrderId: wo.id, seq: 1, kind: "OPERATION", opType: "RACK", title: "cross-tenant lot", lotId: "iso_lot_b", plannedPayload: {}, updatedAt: new Date() } });
      });
    } catch { woFkRaised = true; }
    check("WO task cross-tenant lot reference rejected (composite FK, K11)", woFkRaised);
    // Plan 053 A5/A7: work_order_dependency isolation.
    const aSeesDepB = await asTenant(A, (db) => db.workOrderDependency.findFirst({ where: { id: "iso_wodep_b" } }));
    check("tenant A CANNOT see tenant B's work_order_dependency (RLS)", aSeesDepB === null);
    let depInsertRaised = false;
    try {
      await asTenant(A, (db) => db.workOrderDependency.create({ data: { id: "iso_wodep_x", tenantId: B, workOrderId: "iso_wo_b", dependsOnWorkOrderId: "iso_wo_bp" } }));
    } catch { depInsertRaised = true; }
    check("foreign-tenant work_order_dependency INSERT raises (WITH CHECK)", depInsertRaised);
    // An edge in A whose predecessor is B's WO must be rejected by the composite (tenantId, dependsOnWorkOrderId) FK.
    let depFkRaised = false;
    try {
      await asTenant(A, (db) => db.workOrderDependency.create({ data: { id: "iso_wodep_fk", tenantId: A, workOrderId: "iso_wo_a", dependsOnWorkOrderId: "iso_wo_b" } }));
    } catch { depFkRaised = true; }
    check("WO dependency cross-tenant reference rejected (composite FK)", depFkRaised);
    // Plan 053 B10: equipment_asset + work_order_task_equipment isolation.
    const aSeesEqB = await asTenant(A, (db) => db.equipmentAsset.findFirst({ where: { id: "iso_eq_b" } }));
    check("tenant A CANNOT see tenant B's equipment_asset (RLS)", aSeesEqB === null);
    const aSeesWoteB = await asTenant(A, (db) => db.workOrderTaskEquipment.findFirst({ where: { id: "iso_wote_b" } }));
    check("tenant A CANNOT see tenant B's work_order_task_equipment (RLS)", aSeesWoteB === null);
    let eqInsertRaised = false;
    try {
      await asTenant(A, (db) => db.equipmentAsset.create({ data: { id: "iso_eq_x", tenantId: B, name: "ISO Press X", kind: "press", updatedAt: new Date() } }));
    } catch { eqInsertRaised = true; }
    check("foreign-tenant equipment_asset INSERT raises (WITH CHECK)", eqInsertRaised);
    // A task↔equipment link in A pointing at B's equipment must be rejected by the composite FK.
    let woteFkRaised = false;
    try {
      await asTenant(A, (db) => db.workOrderTaskEquipment.create({ data: { id: "iso_wote_fk", tenantId: A, taskId: "iso_wot_fk", equipmentId: "iso_eq_b" } }));
    } catch { woteFkRaised = true; }
    check("task↔equipment cross-tenant reference rejected (composite FK)", woteFkRaised);
    // Plan 069: vendor + vendor_contact isolation + cross-tenant vendor FK rejects.
    const aSeesVendorB = await asTenant(A, (db) => db.vendor.findFirst({ where: { id: "iso_vendor_b" } }));
    check("tenant A CANNOT see tenant B's vendor (RLS)", aSeesVendorB === null);
    const aSeesVcB = await asTenant(A, (db) => db.vendorContact.findFirst({ where: { id: "iso_vc_b" } }));
    check("tenant A CANNOT see tenant B's vendor_contact (RLS)", aSeesVcB === null);
    let vendorInsertRaised = false;
    try {
      await asTenant(A, (db) => db.vendor.create({ data: { id: "iso_vendor_x", tenantId: B, name: "ISO Vendor X", updatedAt: new Date() } }));
    } catch { vendorInsertRaised = true; }
    check("foreign-tenant vendor INSERT raises (WITH CHECK)", vendorInsertRaised);
    let vcFkRaised = false;
    try {
      await asTenant(A, (db) => db.vendorContact.create({ data: { id: "iso_vc_fk", tenantId: A, vendorId: "iso_vendor_b", name: "ISO VC FK", updatedAt: new Date() } }));
    } catch { vcFkRaised = true; }
    check("vendor_contact cross-tenant vendor reference rejected (composite FK, K11)", vcFkRaised);
    let matVendorFkRaised = false;
    try {
      await asTenant(A, (db) => db.cellarMaterial.create({ data: { id: "iso_mat_vfk", tenantId: A, name: "ISO Mat VFK", normalizedKey: "ISOMATVFK", kind: "OTHER", vendorId: "iso_vendor_b" } }));
    } catch { matVendorFkRaised = true; }
    check("cellar_material cross-tenant vendor reference rejected (composite FK, K11)", matVendorFkRaised);
    // Plan 072: a vendor MERGE re-points references then deletes the loser — both are same-tenant-only.
    // Prove tenant A can neither retire nor rewrite tenant B's vendor (RLS filters it → 0 rows affected),
    // so a merge can never reach across tenants.
    const vendorCrossUpd = await asTenant(A, (db) => db.vendor.updateMany({ where: { id: "iso_vendor_b" }, data: { name: "iso hijack" } }));
    check("cross-tenant vendor UPDATE affects 0 rows (merge can't touch another tenant's vendor)", vendorCrossUpd.count === 0, `count=${vendorCrossUpd.count}`);
    const vendorCrossDel = await asTenant(A, (db) => db.vendor.deleteMany({ where: { id: "iso_vendor_b" } }));
    check("cross-tenant vendor DELETE affects 0 rows (merge can't retire another tenant's vendor)", vendorCrossDel.count === 0, `count=${vendorCrossDel.count}`);
    // Plan 053 C11: work_order_task_type isolation.
    const aSeesWttB = await asTenant(A, (db) => db.workOrderTaskType.findFirst({ where: { id: "iso_wtt_b" } }));
    check("tenant A CANNOT see tenant B's work_order_task_type (RLS)", aSeesWttB === null);
    let wttInsertRaised = false;
    try {
      await asTenant(A, (db) => db.workOrderTaskType.create({ data: { id: "iso_wtt_x", tenantId: B, code: "ISO_LOG_X", label: "x", fieldsJson: [] } }));
    } catch { wttInsertRaised = true; }
    check("foreign-tenant work_order_task_type INSERT raises (WITH CHECK)", wttInsertRaised);
    // Plan 053 C12: work_order_task_type_overlay isolation.
    const aSeesOvlB = await asTenant(A, (db) => db.workOrderTaskTypeOverlay.findFirst({ where: { id: "iso_ovl_b" } }));
    check("tenant A CANNOT see tenant B's work_order_task_type_overlay (RLS)", aSeesOvlB === null);
    let ovlInsertRaised = false;
    try {
      await asTenant(A, (db) => db.workOrderTaskTypeOverlay.create({ data: { id: "iso_ovl_x", tenantId: B, baseTaskType: "RACK", hiddenFields: [], relabels: {}, fieldOrder: [] } }));
    } catch { ovlInsertRaised = true; }
    check("foreign-tenant work_order_task_type_overlay INSERT raises (WITH CHECK)", ovlInsertRaised);

    // 5i. Phase 9.1: vessel_activity_event + vessel_activity_supply_use tenant isolation (maintenance lane).
    const aSeesVaeB = await asTenant(A, (db) => db.vesselActivityEvent.findFirst({ where: { id: "iso_vae_b" } }));
    check("tenant A CANNOT see tenant B's vessel_activity_event (RLS)", aSeesVaeB === null);
    let vaeInsertRaised = false;
    try {
      await asTenant(A, (db) => db.vesselActivityEvent.create({ data: { id: "iso_vae_x", tenantId: B, vesselId: "iso_vessel_b", kind: "CLEAN", enteredByEmail: "iso@test", commandId: "iso-vae-cmd-x" } }));
    } catch { vaeInsertRaised = true; }
    check("foreign-tenant vessel_activity_event INSERT raises (WITH CHECK)", vaeInsertRaised);
    // A supply-use in A referencing B's event must be rejected by the composite (tenantId, eventId) FK (K11).
    let vaeFkRaised = false;
    try {
      await asTenant(A, (db) => db.vesselActivitySupplyUse.create({ data: { id: "iso_vasu_fk", tenantId: A, vesselActivityEventId: "iso_vae_b", supplyLotId: "iso_supply_b", materialId: "iso_mat_b", qty: "1", unit: "g" } }));
    } catch { vaeFkRaised = true; }
    check("supply-use cross-tenant event reference rejected (composite FK, K11)", vaeFkRaised);

    // 5j. Plan 040 PR2: calculation_log tenant isolation + DB-enforced append-only. A can't see B's;
    // a foreign INSERT is rejected (WITH CHECK); and app_rls has UPDATE/DELETE REVOKEd, so even A's
    // OWN row cannot be mutated (privilege denial) — the tamper-resistance the audit exists to give.
    const aSeesCalcB = await asTenant(A, (db) => db.calculationLog.findFirst({ where: { id: "iso_calc_b" } }));
    check("tenant A CANNOT see tenant B's calculation_log (RLS)", aSeesCalcB === null);
    let calcInsertRaised = false;
    try {
      await asTenant(A, (db) => db.calculationLog.create({ data: { id: "iso_calc_x", tenantId: B, userId: "u", userEmail: "iso@test", calculatorId: "so2-kmbs", formulaId: "so2-kmbs", section: "SO₂ Additions", inputs: {}, output: {}, unitsUsed: {}, source: "PAGE", engineVersion: "1.0.0" } }));
    } catch { calcInsertRaised = true; }
    check("foreign-tenant calculation_log INSERT raises (WITH CHECK)", calcInsertRaised);
    let calcUpdateDenied = false;
    try {
      await asTenant(A, (db) => db.calculationLog.update({ where: { id: "iso_calc_a" }, data: { section: "hacked" } }));
    } catch { calcUpdateDenied = true; }
    check("calculation_log UPDATE denied to app_rls (append-only)", calcUpdateDenied);
    let calcDeleteDenied = false;
    try {
      await asTenant(A, (db) => db.calculationLog.delete({ where: { id: "iso_calc_a" } }));
    } catch { calcDeleteDenied = true; }
    check("calculation_log DELETE denied to app_rls (append-only)", calcDeleteDenied);

    // 5k. Phase 1 identity presentation: naming_template / lot_identifier / lot_code_event isolation
    // + the lot_identifier composite (tenantId, lotId) FK cross-tenant reject (K11).
    check("tenant A CANNOT see tenant B's lot_identifier (RLS)", (await asTenant(A, (db) => db.lotIdentifier.findFirst({ where: { id: "iso_li_b" } }))) === null);
    check("tenant A CANNOT see tenant B's naming_template (RLS)", (await asTenant(A, (db) => db.namingTemplate.findFirst({ where: { id: "iso_nt_b" } }))) === null);
    check("tenant A CANNOT see tenant B's lot_code_event (RLS)", (await asTenant(A, (db) => db.lotCodeEvent.findFirst({ where: { id: "iso_lce_b" } }))) === null);
    let liInsertRaised = false;
    try {
      await asTenant(A, (db) => db.lotIdentifier.create({ data: { id: "iso_li_x", tenantId: B, lotId: "iso_lot_b", kind: "current-code", value: "X", updatedAt: new Date() } }));
    } catch { liInsertRaised = true; }
    check("foreign-tenant lot_identifier INSERT raises (WITH CHECK)", liInsertRaised);
    let liFkRaised = false;
    try {
      await asTenant(A, (db) => db.lotIdentifier.create({ data: { id: "iso_li_k11", tenantId: A, lotId: "iso_lot_b", kind: "prior-code", value: "K11", updatedAt: new Date() } }));
    } catch { liFkRaised = true; }
    check("lot_identifier cross-tenant lot reference rejected (composite FK, K11)", liFkRaised);
    // E4: the seeded current-code row for A's lot is visible to A and correctly tenant-stamped.
    const liA = await asTenant(A, (db) => db.lotIdentifier.findFirst({ where: { id: "iso_li_a" }, select: { tenantId: true, lotId: true } }));
    check("backfilled current-code row lands on the right tenant (E4)", liA?.tenantId === A && liA?.lotId === "iso_lot_a");

    // Phase 2 (BOND-1 / TAXCLASS-1): bond + change_of_tax_class_event RLS + composite-FK reject + backfill-tenant.
    check("tenant A CANNOT see tenant B's bond (RLS)", (await asTenant(A, (db) => db.bond.findFirst({ where: { id: "iso_bond_b" } }))) === null);
    check("tenant A CANNOT see tenant B's change_of_tax_class_event (RLS)", (await asTenant(A, (db) => db.changeOfTaxClassEvent.findFirst({ where: { id: "iso_ctc_b" } }))) === null);
    let bondInsertRaised = false;
    try {
      await asTenant(A, (db) => db.bond.create({ data: { id: "iso_bond_x", tenantId: B, registryNumber: "ISO-BOND-X", updatedAt: new Date() } }));
    } catch { bondInsertRaised = true; }
    check("foreign-tenant bond INSERT raises (WITH CHECK)", bondInsertRaised);
    let ctcFkRaised = false;
    try {
      await asTenant(A, (db) => db.changeOfTaxClassEvent.create({ data: { id: "iso_ctc_k11", tenantId: A, lotId: "iso_lot_b", toClass: "A_LE16", observedAt: new Date() } }));
    } catch { ctcFkRaised = true; }
    check("change_of_tax_class_event cross-tenant lot reference rejected (composite FK, K11)", ctcFkRaised);
    const bondA = await asTenant(A, (db) => db.bond.findFirst({ where: { id: "iso_bond_a" }, select: { tenantId: true, isPrimary: true } }));
    check("bond fixture lands on the right tenant + is primary (backfill shape)", bondA?.tenantId === A && bondA?.isPrimary === true);

    // Phase 3 migration kernel: staged/import evidence tables are tenant-isolated, and composite FKs
    // reject cross-tenant staged references.
    check("tenant A CANNOT see tenant B's migration_import_batch (RLS)", (await asTenant(A, (db) => db.migrationImportBatch.findFirst({ where: { id: "iso_mig_batch_b" } }))) === null);
    check("tenant A CANNOT see tenant B's migration_seed_lot (RLS)", (await asTenant(A, (db) => db.migrationSeedLot.findFirst({ where: { id: "iso_mig_lot_b" } }))) === null);
    check("tenant A CANNOT see tenant B's migration_seed_position (RLS)", (await asTenant(A, (db) => db.migrationSeedPosition.findFirst({ where: { id: "iso_mig_pos_b" } }))) === null);
    check("tenant A CANNOT see tenant B's legacy/reconciliation mapping tables (RLS)",
      (await asTenant(A, (db) => db.migrationReconciliationItem.findFirst({ where: { id: "iso_mig_rec_b" } }))) === null &&
      (await asTenant(A, (db) => db.migrationFieldMapping.findFirst({ where: { id: "iso_mig_field_b" } }))) === null &&
      (await asTenant(A, (db) => db.migrationEntityMapping.findFirst({ where: { id: "iso_mig_entity_b" } }))) === null);
    let migInsertRaised = false;
    try {
      await asTenant(A, (db) => db.migrationImportBatch.create({ data: { id: "iso_mig_batch_x", tenantId: B, sourceSystem: "iso", cutoverAt: new Date(), sourceManifest: {}, updatedAt: new Date() } }));
    } catch { migInsertRaised = true; }
    check("foreign-tenant migration_import_batch INSERT raises (WITH CHECK)", migInsertRaised);
    let migFkRaised = false;
    try {
      await asTenant(A, async (db) => {
        const batch = await db.migrationImportBatch.create({ data: { id: "iso_mig_batch_a", tenantId: A, sourceSystem: "iso", cutoverAt: new Date(), sourceManifest: {}, updatedAt: new Date() } });
        const lot = await db.migrationSeedLot.create({ data: { id: "iso_mig_lot_a", tenantId: A, importBatchId: batch.id, sourceLotKey: "a", code: "A", form: "WINE", updatedAt: new Date() } });
        await db.migrationSeedPosition.create({ data: { id: "iso_mig_pos_fk", tenantId: A, importBatchId: batch.id, seedLotId: lot.id, sourcePositionKey: "fk", sourceVesselKey: "foreign", vesselId: "iso_vessel_b", vesselCode: "B", volumeL: "1.00", updatedAt: new Date() } });
      });
    } catch { migFkRaised = true; }
    check("migration_seed_position cross-tenant vessel reference rejected (composite FK)", migFkRaised);

    // 5l. #90 app-layer user-management scoping (mirrors src/lib/users/scope.ts). User/Member are
    // GLOBAL (no RLS) so isolation is the membership WHERE, not the DB — assert it excludes B's user.
    // Uses the owner client on purpose (RLS is irrelevant for global tables); a regression to a bare
    // { id } lookup would flip the 2nd + 3rd checks.
    const umWhere = (userId: string, tenantId: string) => ({ id: userId, memberships: { some: { organizationId: tenantId } } });
    check("user mgmt: A can load its own member user", (await owner.user.findFirst({ where: umWhere("iso_um_user_a", A) })) !== null);
    check("user mgmt: A CANNOT load tenant B's user (membership WHERE)", (await owner.user.findFirst({ where: umWhere("iso_um_user_b", A) })) === null);
    const umListA = (await owner.user.findMany({ where: { memberships: { some: { organizationId: A } } }, select: { id: true } })).map((u) => u.id);
    check("user mgmt: A's user list excludes B's user", umListA.includes("iso_um_user_a") && !umListA.includes("iso_um_user_b"));

    // 6. Positive control: same-tenant op line on A's own lot succeeds.
    let sameTenantOk = false;
    try {
      await asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "iso_lot_a", deltaL: 1, bucket: "EXTERNAL", lotCode: "ISO-A" } });
        // cleanup this op within the same tenant
        await db.lotOperationLine.deleteMany({ where: { operationId: op.id } });
        await db.lotOperation.deleteMany({ where: { id: op.id } });
      });
      sameTenantOk = true;
    } catch (e) { sameTenantOk = false; console.error(e); }
    check("same-tenant op line succeeds (positive control)", sameTenantOk);
  } finally {
    // ── Teardown (owner). ──
    await owner.feedbackLinearLink.deleteMany({
      where: {
        id: {
          in: [
            "iso_linear_link_a",
            "iso_linear_link_b",
            "iso_linear_link_shared",
            "iso_linear_link_cross",
            "iso_linear_link_both",
            "iso_linear_link_neither",
            "iso_linear_link_duplicate",
          ],
        },
      },
    });
    await owner.feedbackTicket.deleteMany({
      where: { id: { in: ["iso_linear_ticket_a1", "iso_linear_ticket_a2", "iso_linear_ticket_b"] } },
    });
    await owner.assistantFeedback.deleteMany({
      where: { id: { in: ["iso_linear_feedback_a", "iso_linear_feedback_b"] } },
    });
    // Phase 15 first (delivery → connection/cost_export_event FK order; all before org B is removed).
    await owner.accountingDelivery.deleteMany({ where: { id: { in: ["iso_del_1", "iso_del_2"] } } });
    await owner.accountMapping.deleteMany({ where: { id: { in: ["iso_map_1", "iso_map_2"] } } });
    await owner.salesExportEvent.deleteMany({ where: { id: "iso_see_b" } });
    // Phase 9.1: supply-uses cascade with their event; delete events then the iso vessel (before org B).
    await owner.calculationLog.deleteMany({ where: { id: { in: ["iso_calc_a", "iso_calc_b", "iso_calc_x"] } } });
    await owner.vesselActivitySupplyUse.deleteMany({ where: { id: { in: ["iso_vasu_fk"] } } });
    await owner.vesselActivityEvent.deleteMany({ where: { id: { in: ["iso_vae_b", "iso_vae_x"] } } });
    await owner.migrationAnalysisReading.deleteMany({ where: { importBatchId: { in: ["iso_mig_batch_b", "iso_mig_batch_a", "iso_mig_batch_x"] } } });
    await owner.migrationAnalysisPanel.deleteMany({ where: { importBatchId: { in: ["iso_mig_batch_b", "iso_mig_batch_a", "iso_mig_batch_x"] } } });
    await owner.migrationSeedPosition.deleteMany({ where: { id: { in: ["iso_mig_pos_b", "iso_mig_pos_fk"] } } });
    await owner.migrationSeedLot.deleteMany({ where: { id: { in: ["iso_mig_lot_b", "iso_mig_lot_a"] } } });
    await owner.legacyOperation.deleteMany({ where: { importBatchId: { in: ["iso_mig_batch_b", "iso_mig_batch_a", "iso_mig_batch_x"] } } });
    await owner.migrationReconciliationItem.deleteMany({ where: { id: "iso_mig_rec_b" } });
    await owner.migrationFieldMapping.deleteMany({ where: { id: "iso_mig_field_b" } });
    await owner.migrationEntityMapping.deleteMany({ where: { id: "iso_mig_entity_b" } });
    await owner.migrationImportBatch.deleteMany({ where: { id: { in: ["iso_mig_batch_b", "iso_mig_batch_a", "iso_mig_batch_x"] } } });
    await owner.vessel.deleteMany({ where: { id: "iso_vessel_b" } });
    // Phase 9: tasks + dependency edges cascade with their work_order; delete WOs (both tenants + controls).
    await owner.workOrderDependency.deleteMany({ where: { id: { in: ["iso_wodep_b", "iso_wodep_x", "iso_wodep_fk"] } } });
    await owner.workOrderTaskEquipment.deleteMany({ where: { id: { in: ["iso_wote_b", "iso_wote_fk"] } } });
    await owner.equipmentAsset.deleteMany({ where: { id: { in: ["iso_eq_b", "iso_eq_x"] } } });
    // Plan 069: vendor children (contacts, the FK-test material) before the vendors (ON DELETE RESTRICT).
    await owner.vendorContact.deleteMany({ where: { id: { in: ["iso_vc_b", "iso_vc_fk"] } } });
    await owner.cellarMaterial.deleteMany({ where: { id: "iso_mat_vfk" } });
    await owner.vendor.deleteMany({ where: { id: { in: ["iso_vendor_b", "iso_vendor_x"] } } });
    await owner.workOrderTaskTypeOverlay.deleteMany({ where: { id: { in: ["iso_ovl_b", "iso_ovl_x"] } } });
    await owner.workOrderTaskType.deleteMany({ where: { id: { in: ["iso_wtt_b", "iso_wtt_x"] } } });
    await owner.workOrder.deleteMany({ where: { id: { in: ["iso_wo_a", "iso_wo_b", "iso_wo_bp", "iso_wo_x", "iso_wo_fk_a"] } } });
    await owner.commerce7Connection.deleteMany({ where: { id: { in: ["iso_c7_conn_a", "iso_c7_conn_b", "iso_c7_conn_x"] } } });
    await owner.costExportEvent.deleteMany({ where: { id: "iso_cee_a" } });
    await owner.accountingConnection.deleteMany({ where: { id: { in: ["iso_acct_conn_a", "iso_acct_conn_b", "iso_acct_conn_x"] } } });
    // Phase 1: identifiers/events (composite-FK'd to lot) + naming templates, before the lots/org drop.
    await owner.lotCodeEvent.deleteMany({ where: { id: { in: ["iso_lce_b"] } } });
    await owner.lotIdentifier.deleteMany({ where: { id: { in: ["iso_li_a", "iso_li_b", "iso_li_x", "iso_li_k11"] } } });
    // Phase 2: change_of_tax_class_event is composite-FK'd to lot → delete before the lots below.
    await owner.changeOfTaxClassEvent.deleteMany({ where: { id: { in: ["iso_ctc_b", "iso_ctc_k11"] } } });
    await owner.namingTemplateVersion.deleteMany({ where: { id: "iso_ntv_b" } });
    await owner.namingTemplate.deleteMany({ where: { id: { in: ["iso_nt_a", "iso_nt_b"] } } });
    await owner.lotOperationLine.deleteMany({ where: { lotId: { in: ["iso_lot_a", "iso_lot_b"] } } });
    await owner.lotOperation.deleteMany({ where: { tenantId: B } });
    await owner.supplyLot.deleteMany({ where: { id: { in: ["iso_supply_b", "iso_supply_x"] } } });
    await owner.cellarMaterial.deleteMany({ where: { id: "iso_mat_b" } });
    await owner.brixLog.deleteMany({ where: { id: { in: ["iso_brix_a", "iso_brix_b"] } } });
    await owner.vineyardBlock.deleteMany({ where: { id: { in: ["iso_blk_a", "iso_blk_b"] } } });
    await owner.vineyard.deleteMany({ where: { id: { in: ["iso_vy_a", "iso_vy_b"] } } });
    await owner.lot.deleteMany({ where: { id: { in: ["iso_lot_a", "iso_lot_b", "iso_lot_x"] } } });
    // Phase 2: bonds are FK'd to organization → delete before org B drops.
    await owner.bond.deleteMany({ where: { id: { in: ["iso_bond_a", "iso_bond_b", "iso_bond_x"] } } });
    // #90: member rows are FK'd to organization + user → delete before org B and the users drop.
    await owner.member.deleteMany({ where: { userId: { in: ["iso_um_user_a", "iso_um_user_b"] } } });
    await owner.user.deleteMany({ where: { id: { in: ["iso_um_user_a", "iso_um_user_b"] } } });
    await owner.organization.deleteMany({ where: { id: B } });
    await app.$disconnect();
    await owner.$disconnect();
  }

  console.log(failures === 0 ? "\nALL ISOLATION CHECKS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
