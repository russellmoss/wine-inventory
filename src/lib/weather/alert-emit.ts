import "server-only";

// Plan 096 Phase 3 Unit 21 — the notification emit. Runs INSIDE runAsTenant, once per tenant,
// AFTER its vineyards' forecasts are refreshed. The chain:
//   classify (U20, over THE primary series — council C3) → CLAIM-FIRST state advance (a single
//   conditional upsert per key; only the tx that won the rank advance emits — council C2: the
//   6-hourly cron and the strip's on-view refresh can race, the loser sends nothing) → group won
//   claims into ONE DIGEST per (targetDate, tier) across the tenant's vineyards (Gemini S2,
//   user-confirmed: a regional freeze must not become 24 notifications) → emitNotificationTx to
//   EVERY active member (user decision; INBOX-1 stays intact — the emit path is INSERT-tenant-only)
//   → de-escalation claims emit ONE all-clear when a WARNING+ key drops below watch (council C6).
// State claims and notification writes share ONE tx — a crash can't strand a claim without its
// notifications. Copy comes from alert-core's tested digest builders (risk framing, S5 nights).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { emitNotificationTx } from "@/lib/inbox/notifications";
import { buildWeatherAlertNotificationPayload } from "@/lib/inbox/payloads";
import {
  classifyForecastAlertsCore,
  weatherAlertDigest,
  weatherAllClearDigest,
  TIER_RANK,
  type ForecastAlertCandidate,
  type ForecastAlertTier,
} from "./alert-core";
import { selectPrimaryForecastSeries, type ForecastRow } from "./forecast-read-core";
import { resolveVineyardCentroid } from "./location";
import { resolveSiteTimeZone, siteTodayIso } from "./site-time-core";
import { getWineryTimeZone, getUnitPrefs } from "@/lib/settings/data";

export interface AlertEmitSummary {
  candidates: number;
  claimsWon: number;
  digestsSent: number;
  allClearsSent: number;
  recipients: number;
}

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** All active members of the current tenant (member rows ∩ user.banned != true — the reminder-sweep pattern). */
async function listActiveRecipients(tenantId: string): Promise<Array<{ userId: string; email: string }>> {
  const members = await prisma.member.findMany({ where: { organizationId: tenantId }, select: { userId: true } });
  if (members.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) }, banned: { not: true } },
    select: { id: true, email: true },
  });
  return users.map((u) => ({ userId: u.id, email: u.email }));
}

/**
 * Emit forecast frost/heat digests + all-clears for the CURRENT tenant. Call inside runAsTenant.
 * `onlyVineyardIds` scopes classification (verify:weather isolates its QA vineyard); production
 * callers omit it.
 */
export async function emitForecastAlertsForTenant(opts: { onlyVineyardIds?: string[] } = {}): Promise<AlertEmitSummary> {
  const tenantId = requireTenantId();
  const summary: AlertEmitSummary = { candidates: 0, claimsWon: 0, digestsSent: 0, allClearsSent: 0, recipients: 0 };

  const vineyards = await prisma.vineyard.findMany({
    where: { isActive: true, ...(opts.onlyVineyardIds ? { id: { in: opts.onlyVineyardIds } } : {}) },
    select: { id: true, name: true },
  });
  const nameById = new Map(vineyards.map((v) => [v.id, v.name]));
  const configs = new Map(
    (
      await prisma.vineyardWeatherConfig.findMany({
        select: { vineyardId: true, timeZone: true, frostWatchC: true, frostWarnC: true, hardFreezeC: true, heatWatchC: true, extremeHeatC: true },
      })
    ).map((c) => [c.vineyardId, c]),
  );
  const wineryTz = await getWineryTimeZone().catch(() => null);
  // Plan 098 — digest prose follows the WEATHER FAMILY's coarse rule (the tenant master), so a
  // digest always speaks the same system as the weather card/assistant it references. Non-weather
  // temperature surfaces (ferment, field notes) follow the temperature dimension instead — the
  // documented grain split (see display.ts). Best-effort; unconfigured stays °C, the pre-098 copy.
  const prefs = await getUnitPrefs().catch(() => null);
  const proseUnits = prefs?.configuredSystem === "IMPERIAL" ? ("IMPERIAL" as const) : ("METRIC" as const);

  // 1) Classify every vineyard's PRIMARY forecast series (C3 — never the secondary provider).
  const candidatesByVineyard = new Map<string, ForecastAlertCandidate[]>();
  for (const v of vineyards) {
    const cfg = configs.get(v.id);
    const todayIso = siteTodayIso(resolveSiteTimeZone(cfg?.timeZone, wineryTz));
    const rowsRaw = await prisma.vineyardForecastDaily.findMany({ where: { vineyardId: v.id }, orderBy: { targetDate: "asc" } });
    if (rowsRaw.length === 0) continue;
    const rows: ForecastRow[] = rowsRaw.map((r) => ({
      providerKey: r.providerKey,
      targetDate: r.targetDate.toISOString().slice(0, 10),
      issuedAt: r.issuedAt.toISOString(),
      tmaxC: dec(r.tmaxC),
      tminC: dec(r.tminC),
      precipMm: dec(r.precipMm),
      precipProbabilityPct: dec(r.precipProbabilityPct),
      conditionCode: r.conditionCode,
      windMaxKph: dec(r.windMaxKph),
    }));
    const primary = selectPrimaryForecastSeries(rows, todayIso);
    if (!primary) continue;
    const centroid = await resolveVineyardCentroid(v.id);
    if (!centroid) continue;
    const cands = classifyForecastAlertsCore(
      primary.rows.map((r) => ({ targetDate: r.targetDate, tminC: r.tminC, tmaxC: r.tmaxC })),
      {
        latitude: centroid.lat,
        todayIso,
        thresholds: cfg
          ? { frostWatchC: dec(cfg.frostWatchC) ?? undefined, frostWarnC: dec(cfg.frostWarnC) ?? undefined, hardFreezeC: dec(cfg.hardFreezeC) ?? undefined, heatWatchC: dec(cfg.heatWatchC) ?? undefined, extremeHeatC: dec(cfg.extremeHeatC) ?? undefined }
          : undefined,
      },
    );
    summary.candidates += cands.length;
    candidatesByVineyard.set(v.id, cands);
  }

  const recipients = await listActiveRecipients(tenantId);
  summary.recipients = recipients.length;

  // 2) ONE tx: claim-first state advances + all-clear claims + the digest emits — atomic.
  await runInTenantTx(
    async (tx) => {
      type Won = { vineyardId: string; targetDate: string; tier: ForecastAlertTier; valueC: number; runEndDate?: string };
      const won: Won[] = [];
      const cleared: Array<{ vineyardId: string; targetDate: string; tier: ForecastAlertTier }> = [];

      for (const [vineyardId, cands] of candidatesByVineyard) {
        // Best candidate per (targetDate, alertType) — the claim key.
        const bestByKey = new Map<string, ForecastAlertCandidate>();
        for (const c of cands) {
          const k = `${c.targetDate}:${c.alertType}`;
          const prev = bestByKey.get(k);
          if (!prev || c.rank > prev.rank) bestByKey.set(k, c);
        }

        // Notify-eligible candidates: claim the rank advance; only a WON claim emits (C2).
        for (const c of bestByKey.values()) {
          if (!c.notifyEligible) continue;
          const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "vineyard_weather_alert_state"
              ("id","tenantId","vineyardId","targetDate","alertType","notifiedTier","notifiedRank","lastNotifiedAt","clearedAt","createdAt","updatedAt")
            VALUES (gen_random_uuid()::text, ${tenantId}, ${vineyardId}, ${c.targetDate}::date, ${c.alertType},
                    ${c.tier}, ${c.rank}, now(), NULL, now(), now())
            ON CONFLICT ("tenantId","vineyardId","targetDate","alertType") DO UPDATE SET
              "notifiedTier" = EXCLUDED."notifiedTier", "notifiedRank" = EXCLUDED."notifiedRank",
              "lastNotifiedAt" = now(), "clearedAt" = NULL, "updatedAt" = now()
            WHERE "vineyard_weather_alert_state"."notifiedRank" < EXCLUDED."notifiedRank"
            RETURNING "id"`);
          if (claimed.length > 0) {
            summary.claimsWon += 1;
            won.push({ vineyardId, targetDate: c.targetDate, tier: c.tier, valueC: c.valueC, runEndDate: c.runEndDate });
          }
        }

        // De-escalation (C6): a stored WARNING+ key whose current classification dropped below
        // watch claims its all-clear the same conditional way (no flapping — clearedAt gates).
        const states = await tx.vineyardWeatherAlertState.findMany({
          where: { vineyardId, notifiedRank: { gte: 2 }, clearedAt: null },
          select: { id: true, targetDate: true, alertType: true, notifiedTier: true },
        });
        for (const s of states) {
          const k = `${s.targetDate.toISOString().slice(0, 10)}:${s.alertType}`;
          const current = bestByKey.get(k);
          if (current && current.rank > 0) continue; // still alerting — not a clear
          const clearClaim = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE "vineyard_weather_alert_state"
            SET "clearedAt" = now(), "notifiedTier" = NULL, "notifiedRank" = 0, "updatedAt" = now()
            WHERE "id" = ${s.id} AND "clearedAt" IS NULL AND "notifiedRank" >= 2
            RETURNING "id"`);
          if (clearClaim.length > 0 && s.notifiedTier) {
            cleared.push({ vineyardId, targetDate: s.targetDate.toISOString().slice(0, 10), tier: s.notifiedTier as ForecastAlertTier });
          }
        }
      }

      // 3) Digest per (targetDate, tier) across vineyards (Gemini S2) → every active member.
      const digestGroups = new Map<string, Won[]>();
      for (const w of won) {
        const k = `${w.targetDate}:${w.tier}`;
        digestGroups.set(k, [...(digestGroups.get(k) ?? []), w]);
      }
      for (const [, group] of digestGroups) {
        const tier = group[0].tier;
        const isFrost = TIER_RANK[tier] > 0 && (tier.startsWith("FROST") || tier === "HARD_FREEZE");
        const worst = isFrost ? Math.min(...group.map((g) => g.valueC)) : Math.max(...group.map((g) => g.valueC));
        const copy = weatherAlertDigest({
          tier,
          targetDate: group[0].targetDate,
          vineyardNames: group.map((g) => nameById.get(g.vineyardId) ?? g.vineyardId),
          worstValueC: worst,
          runEndDate: group.length === 1 ? group[0].runEndDate : undefined,
          unitSystem: proseUnits,
        });
        const payload = buildWeatherAlertNotificationPayload({ ...copy, targetDate: group[0].targetDate, tier });
        for (const r of recipients) {
          await emitNotificationTx(tx, { recipientUserId: r.userId, recipientEmail: r.email, ...payload });
        }
        summary.digestsSent += 1;
      }

      const clearGroups = new Map<string, typeof cleared>();
      for (const c of cleared) {
        const k = `${c.targetDate}:${c.tier}`;
        clearGroups.set(k, [...(clearGroups.get(k) ?? []), c]);
      }
      for (const [, group] of clearGroups) {
        const copy = weatherAllClearDigest({
          tier: group[0].tier,
          targetDate: group[0].targetDate,
          vineyardNames: group.map((g) => nameById.get(g.vineyardId) ?? g.vineyardId),
        });
        const payload = buildWeatherAlertNotificationPayload({ ...copy, targetDate: group[0].targetDate, tier: `${group[0].tier}:CLEARED` });
        for (const r of recipients) {
          await emitNotificationTx(tx, { recipientUserId: r.userId, recipientEmail: r.email, ...payload });
        }
        summary.allClearsSent += 1;
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return summary;
}
