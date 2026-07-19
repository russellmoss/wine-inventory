/**
 * Plan 079 — seed the GLOBAL knowledge sources + trusted-domain allowlist (idempotent).
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-knowledge-sources.ts
 *
 * These are GLOBAL reference tables (no tenant, like fx_rate); writes go through runAsSystem (owner).
 * Re-runnable: upserts by natural key (source.key / domain), so adding a source to config.ts + re-running
 * is the whole "add a source" workflow.
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { KNOWLEDGE_SOURCES, TRUSTED_DOMAINS } from "@/lib/knowledge/config";

async function main() {
  await runAsSystem(async (db) => {
    for (const s of KNOWLEDGE_SOURCES) {
      const fields = {
        publisher: s.publisher,
        homeDomain: s.homeDomain,
        tier: s.tier,
        license: s.license,
        seedRoots: s.seedRoots,
        allowPrefixes: s.allowPrefixes,
        denyPrefixes: s.denyPrefixes,
        crawlCadence: s.crawlCadence,
        defaultEnabled: s.defaultEnabled,
      };
      await db.knowledgeSource.upsert({
        where: { key: s.key },
        update: { ...fields, active: true },
        create: { key: s.key, ...fields },
      });
      console.log(`  source: ${s.key.padEnd(16)} (${s.publisher})`);
    }
    for (const d of TRUSTED_DOMAINS) {
      await db.trustedDomain.upsert({
        where: { domain: d.domain },
        update: { sourceKey: d.sourceKey ?? null },
        create: { domain: d.domain, sourceKey: d.sourceKey ?? null },
      });
      console.log(`  trusted domain: ${d.domain}`);
    }
  });
  await disconnectSystem();
  console.log(`seed complete — ${KNOWLEDGE_SOURCES.length} sources, ${TRUSTED_DOMAINS.length} trusted domains.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
