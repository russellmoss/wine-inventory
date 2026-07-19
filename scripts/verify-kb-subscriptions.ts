/**
 * Plan 079 Unit 11 — prove the per-tenant knowledge-source subscription round-trip end-to-end (the DB side
 * of the settings toggle): disabling a source removes it from retrieval's enabled set + the settings loader
 * reflects it, re-enabling restores it, and clearing the row falls back to the source default. Runs in the
 * Demo Winery sandbox and cleans up after itself.
 *
 *   npm run verify:kb-subscriptions
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveEnabledSources, listSourceSettings } from "@/lib/knowledge/subscriptions";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const TENANT = "org_demo_winery";
let failures = 0;
function assert(cond: boolean, label: string, detail = "") {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${label}${cond ? "" : `  — ${detail}`}`);
  if (!cond) failures++;
}

async function upsertSub(sourceId: string, enabled: boolean) {
  await runAsTenant(TENANT, async () => {
    await prisma.knowledgeSourceSubscription.upsert({
      where: { tenantId_sourceId: { tenantId: TENANT, sourceId } },
      update: { enabled },
      create: { sourceId, enabled },
    });
  });
}

async function main() {
  // Pick a default-enabled source to toggle (prefer scott-labs; else the first).
  const settings = await runAsTenant(TENANT, async () => await listSourceSettings());
  assert(settings.length > 0, "loader returns sources", `got ${settings.length}`);
  const target = settings.find((s) => s.key === "scott-labs" && s.enabled) ?? settings.find((s) => s.enabled);
  if (!target) throw new Error("no enabled source to test with");
  console.log(`\ntarget source: ${target.key} (${target.publisher}), ${target.docCount} docs, default=${target.defaultEnabled}\n`);

  // Clean slate: ensure no leftover subscription row from a prior run.
  await runAsTenant(TENANT, async () => {
    await prisma.knowledgeSourceSubscription.deleteMany({ where: { sourceId: target.id } });
  });

  // 1. Baseline: default-enabled → present in retrieval's enabled set.
  const base = await resolveEnabledSources(TENANT);
  assert(base.some((s) => s.id === target.id), "baseline: default source is enabled for retrieval");

  // 2. Disable → dropped from retrieval + loader shows enabled=false.
  await upsertSub(target.id, false);
  const afterOff = await resolveEnabledSources(TENANT);
  assert(!afterOff.some((s) => s.id === target.id), "disabled: source removed from retrieval's enabled set");
  const loaderOff = await runAsTenant(TENANT, async () => await listSourceSettings());
  assert(loaderOff.find((s) => s.id === target.id)?.enabled === false, "disabled: settings loader shows enabled=false");

  // 3. Re-enable → back in retrieval + loader shows enabled=true.
  await upsertSub(target.id, true);
  const afterOn = await resolveEnabledSources(TENANT);
  assert(afterOn.some((s) => s.id === target.id), "re-enabled: source back in retrieval's enabled set");
  const loaderOn = await runAsTenant(TENANT, async () => await listSourceSettings());
  assert(loaderOn.find((s) => s.id === target.id)?.enabled === true, "re-enabled: settings loader shows enabled=true");

  // 4. Isolation: the subscription row is tenant-scoped (invisible to another tenant via RLS).
  const leaked = await runAsSystem((db) =>
    db.knowledgeSourceSubscription.count({ where: { sourceId: target.id, tenantId: { not: TENANT } } }),
  );
  assert(leaked === 0, "isolation: no cross-tenant subscription rows created", `found ${leaked}`);

  // Cleanup: remove the test row → tenant falls back to the source default.
  await runAsTenant(TENANT, async () => {
    await prisma.knowledgeSourceSubscription.deleteMany({ where: { sourceId: target.id } });
  });
  const cleaned = await resolveEnabledSources(TENANT);
  assert(cleaned.some((s) => s.id === target.id) === target.defaultEnabled, "cleanup: falls back to source default");

  console.log(failures === 0 ? "\nALL SUBSCRIPTION CHECKS PASSED ✓" : `\nSUBSCRIPTION CHECKS FAILED ✗ (${failures})`);
  await disconnectSystem();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
