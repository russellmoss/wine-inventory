// -----------------------------------------------------------------------------
// ai-native-allowlist — the two-tier exemption list for verify:ai-native.
//
// A domain core that no assistant tool can reach is normally a CI failure (the
// "talk-to-it" moat leaks). There are TWO legitimate reasons a core is unreached,
// and they must not be conflated:
//
//   INTERNAL      — a PERMANENT exemption. The core has no sensible conversational
//                   surface (an offline-sync mechanism, a composed sub-core, or a
//                   capability already covered by a DIFFERENT core+tool). It never
//                   needs its own tool, so it does NOT count against the ratchet.
//                   Fields: { owner, reason, coveredBy? }.
//
//   GAP_ALLOWLIST — a TEMPORARY deferral of a REAL gap: a core that SHOULD have a
//                   tool but doesn't yet. It counts against MAX_ALLOWED, which only
//                   ever DECREMENTS — you lower it each time you wire a tool and
//                   remove the entry, so the backlog can only shrink (council C5).
//                   Fields: { owner, reason, issue }.
//
// Key = the core file path, repo-relative (matches verify-ai-native's `core`).
// verify:ai-native fails on: an unreached core in neither map; GAP_ALLOWLIST
// larger than MAX_ALLOWED; a stale entry (core gone); a GAP entry that is now
// reachable (burn it down); a core in BOTH maps; a missing owner/reason.
// -----------------------------------------------------------------------------

// Permanent — no conversational surface is appropriate. Not ratcheted.
export const INTERNAL = {
  "src/lib/ferment/panel-core.ts": {
    owner: "winemaking",
    reason:
      "Offline round-capture SYNC core (client-generated panelId/commandId/occupancyToken, " +
      "idempotent outbox drain) — an internal mechanism, not a chat surface. The user-facing " +
      "capability (record a chemistry panel on a lot) is covered by a different core+tool.",
    coveredBy: "record_measurement → recordMeasurementsCore",
  },
  "src/lib/vendors/vendor-import-core.ts": {
    owner: "russellmoss",
    reason:
      "Plan 075 QBO vendor-import review-queue triage (accept / reject / merge-into-existing a pulled QBO " +
      "vendor). An admin/developer maintenance surface driven visually from the /setup/vendors import queue, " +
      "not a winemaker natural-language capability — batch triage over a list is a clicking flow, not a chat one. " +
      "The first-class vendor capabilities (create / query / merge duplicates) already have assistant tools.",
    coveredBy: "/setup/vendors vendor-import queue UI (accept/reject/merge actions)",
  },
  "src/lib/owner/owner-core.ts": {
    owner: "russellmoss",
    reason:
      "Plan 093: managing custom-crush Owners (add/rename/change-kind/deactivate) is a reference-data admin " +
      "task — desk-with-coffee, a clicking flow over a list, not a winemaker natural-language capability " +
      "(per the coalescence 'wet-hands→tool, desk→GUI' rule). The winemaker-facing ownership CAPABILITY " +
      "(change a lot's owner) has its own tool + core (change_ownership → changeOwnershipCore).",
    coveredBy: "/setup/clients admin screen (create/rename/deactivate)",
  },
  // Plan 095: grower-core is NO LONGER internal — it now has a first-class assistant tool (create_grower →
  // createGrowerAction → createGrowerWithSync → createGrowerCore). The ticket (#489) made growers a
  // conversational capability like vendors, so the core is reachable and needs no exemption.
  "src/lib/plantingArea/migration-core.ts": {
    owner: "russellmoss",
    reason:
      "VI-P1: migration-by-union is a one-time, REVIEWED, all-or-nothing setup step — the grower eyeballs " +
      "each proposed parent over satellite imagery ('did we bridge a road?') before confirming. That review " +
      "is a map-and-click flow, not a natural-language capability (coalescence 'desk-with-coffee → GUI'). The " +
      "conversational surface for planting structure (READ) is covered by describe_planting_structure.",
    coveredBy: "planting-setup migration review UI + describe_planting_structure (read)",
  },
  "src/lib/weather/ingest-core.ts": {
    owner: "russellmoss",
    reason:
      "VI-P8: fetching/refreshing a vineyard's weather series from the live providers is a cron + button " +
      "REFRESH mechanism (the daily weather-poll sweep and a manual 'refresh weather' action), not a " +
      "winemaker natural-language capability — you don't converse to trigger a background fetch. The " +
      "grower-facing weather CAPABILITY (ask about GDD vs last year, frost, Winkler, the season) has its own " +
      "read tool + core (query_climate → composeClimateSummaryCore).",
    coveredBy: "query_climate → composeClimateSummaryCore (read); weather-poll cron + refresh action (write)",
  },
  "src/lib/weather/alert-core.ts": {
    owner: "russellmoss",
    reason:
      "VI-P8: frost/heat crossing detection runs inside the daily weather SWEEP and pushes a thin inbox alert " +
      "— a background notification mechanism, not a conversational surface (you don't chat to get an alert). " +
      "The grower-facing frost/heat CAPABILITY (ask about frost risk / heat days / the vulnerable window) is " +
      "answered by query_climate → composeClimateSummaryCore.",
    coveredBy: "query_climate → composeClimateSummaryCore (frost/heat read); weather sweep (alert emit)",
  },
  "src/lib/weather/forecast-ingest-core.ts": {
    owner: "russellmoss",
    reason:
      "Plan 096: fetching/replacing a vineyard's 7-day forecast is the 6-hourly forecast-poll cron + the " +
      "strip's on-view refresh — a background REFRESH mechanism, exactly like its observation twin " +
      "(ingest-core, INTERNAL above); you don't converse to trigger a fetch. The grower-facing forecast " +
      "CAPABILITY (ask for the week's outlook) is query_climate → composeForecastViewCore.",
    coveredBy: "query_climate → composeForecastViewCore (read); forecast-poll cron + refreshVineyardForecast (write)",
  },
  // ── Spray Intelligence S3a (D2, Russell-default: honest INTERNAL with a NAMED RETIREMENT
  // CONDITION, no new tier). The program ships ONE composite read tool (query_spray_decision,
  // thin in S5a, hard-refusing decisions until S7a/S9) and ONE write tool
  // (record_spray_application, S11) — rule §3.15. RETIREMENT: when S11 lands its write tool,
  // these five entries MUST be deleted so verify:ai-native proves reachability; the S11 runbook
  // gate carries that obligation. ──
  "src/lib/spray/record-core.ts": {
    owner: "russellmoss",
    reason:
      "S3a: recording a spray pass IS a genuine winemaker capability, but the program's single write tool " +
      "(record_spray_application) lands in S11 by design (rule §3.15 — one write tool for the whole program, " +
      "on the signed-proposal path). RETIRE THIS ENTRY when S11 ships; the S11 gate names it.",
    coveredBy: "record_spray_application (S11) + query_spray_decision (S5a→S9)",
  },
  "src/lib/spray/correction-core.ts": {
    owner: "russellmoss",
    reason:
      "S3a: correction/void of a spray record rides the same S11 write tool (a correction is a write with a " +
      "confirmation card). RETIRE with the record-core entry when S11 ships.",
    coveredBy: "record_spray_application (S11) + query_spray_decision (S5a→S9)",
  },
  "src/lib/spray/drying-override-core.ts": {
    owner: "russellmoss",
    reason:
      "S3a: the attributed driedBeforeRain override + derived recompute — the recompute is a background " +
      "mechanism (S1's sweep will drive it); the override write joins the S11 tool. RETIRE the override half " +
      "when S11 ships.",
    coveredBy: "record_spray_application (S11); S1 recompute sweep (mechanism)",
  },
  "src/lib/harvest/planned-harvest-core.ts": {
    owner: "russellmoss",
    reason:
      "S3a: setting/retracting a planned harvest date is a capability the S11 write tool covers; the " +
      "reads (current/as-of/changesSince) are consumed by S7a's PHI engine and surfaced through " +
      "query_spray_decision. RETIRE when S11 ships.",
    coveredBy: "record_spray_application (S11) + query_spray_decision (S5a→S9)",
  },
  "src/lib/spray/legacy-mapping-core.ts": {
    owner: "russellmoss",
    reason:
      "S3a: confirming a legacy name→product mapping is a human review gate (rule §3.2 — never " +
      "LLM-auto-applied), driven from a review list in the PR-3 surface; the conversational surface for " +
      "legacy sprays is the S5a→S9 read tool. RETIRE alongside the S11 entries.",
    coveredBy: "query_spray_decision (S5a→S9, read); PR-3 mapping review surface (write)",
  },
};

// Temporary — real gaps deferred with a tracked reason. Ratcheted by MAX_ALLOWED.
export const GAP_ALLOWLIST = {
  // Phase 2: cores shipped + guarded (verify:taxpaid / verify:taxclass); their assistant tools are a
  // deferred fast-follow alongside the U1 rendered surfaces (manual-QA-only; see PHASE-2-REPORT).
  "src/lib/compliance/return-to-bond-core.ts": { owner: "russellmoss", reason: "RETURN_TO_BOND assistant tool deferred to the Phase-2 UX/assistant fast-follow; core proven by verify:taxpaid" },
  "src/lib/compliance/tax-class-event-core.ts": { owner: "russellmoss", reason: "change-tax-class assistant tool deferred to the Phase-2 UX/assistant fast-follow; core proven by verify:taxclass" },
  // Plan 093: owner-core RATCHETED OUT of the gap list — it's now GUI-covered (INTERNAL, /setup/clients).
  // Plan 095: grower-core now has a real tool (create_grower) — reachable, no exemption needed.
};

// The ratchet ceiling for GAP_ALLOWLIST ONLY (INTERNAL is exempt). Set to the
// number of deferred real gaps; only ever DECREMENT as you wire tools.
// Plan 093 ratcheted to baseline (2): weigh-tag-core wired (log_weigh_tag), owner-core reclassified INTERNAL.
// Plan 095: grower-core moved from INTERNAL to reachable (create_grower tool) — INTERNAL is uncounted, so
// MAX_ALLOWED is unchanged.
export const MAX_ALLOWED = 2;
