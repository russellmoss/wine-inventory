// Plan 096 Phase 0 Unit 2 — the ONE definition of site-local "today" for the weather tree.
// Before this, the web card/actions/sweep computed "today" as UTC (`toISOString().slice(0,10)`)
// while the assistant used the winery operating timezone — the same vineyard's "season to date" /
// "was last night a frost?" boundary disagreed by a day near UTC midnight (audit §7). Every
// "today" in the weather tree now routes through here; do not add a second definition.
//
// Chain (first REAL zone wins): vineyard config.timeZone (provider-reported — NWS
// points.timeZone / Open-Meteo timezone=auto, persisted at forecast ingest) → tenant
// AppSettings.timeZone → viewer zone (assistant only) → UTC. Composes the existing pure,
// tested due-at helpers — no tz library, no date math of our own. `zonedDateKey` never throws
// (a bad zone normalizes to UTC), so this chain is total.

import { resolveOperatingTimeZone, zonedDateKey } from "@/lib/work-orders/due-at";

/** Resolve the site-local IANA zone: config → winery AppSettings → viewer → UTC (first real wins). */
export function resolveSiteTimeZone(
  configTz?: string | null,
  wineryTz?: string | null,
  viewerTz?: string | null,
): string {
  return resolveOperatingTimeZone(configTz, resolveOperatingTimeZone(wineryTz, viewerTz ?? null));
}

/** Site-local civil "today" (YYYY-MM-DD) in the given zone. Inject `now` in tests. */
export function siteTodayIso(timeZone: string, now: Date = new Date()): string {
  return zonedDateKey(now, timeZone);
}
