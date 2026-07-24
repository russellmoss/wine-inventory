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
};

// Temporary — real gaps deferred with a tracked reason. Ratcheted by MAX_ALLOWED.
export const GAP_ALLOWLIST = {
  // Phase 2: cores shipped + guarded (verify:taxpaid / verify:taxclass); their assistant tools are a
  // deferred fast-follow alongside the U1 rendered surfaces (manual-QA-only; see PHASE-2-REPORT).
  "src/lib/compliance/return-to-bond-core.ts": { owner: "russellmoss", reason: "RETURN_TO_BOND assistant tool deferred to the Phase-2 UX/assistant fast-follow; core proven by verify:taxpaid" },
  "src/lib/compliance/tax-class-event-core.ts": { owner: "russellmoss", reason: "change-tax-class assistant tool deferred to the Phase-2 UX/assistant fast-follow; core proven by verify:taxclass" },
  // Plan 093: the ownership cores ship in F1/F2 (data model); their assistant coverage lands in F3 Unit 12
  // (owner/grower read + change_ownership + weigh-tag intake). The plan sanctions allow-listing until then.
  // Ratchet back DOWN in F3 as each tool is wired.
  "src/lib/owner/owner-core.ts": { owner: "russellmoss", reason: "createOwnerCore assistant coverage deferred to plan 093 F3 Unit 12; owner is otherwise reference-data admin / read-only in the assistant" },
  "src/lib/grower/grower-core.ts": { owner: "russellmoss", reason: "createGrowerCore assistant coverage deferred to plan 093 F3 Unit 12; grower is otherwise reference-data admin / read-only in the assistant" },
};

// The ratchet ceiling for GAP_ALLOWLIST ONLY (INTERNAL is exempt). Set to the
// number of deferred real gaps; only ever DECREMENT as you wire tools.
// Plan 093: F1 owner-core (3), F2 grower-core (4) + weigh-tag-core (5); F3 Unit 12 wired log_weigh_tag →
// ratcheted weigh-tag-core off (5→4). owner-core + grower-core stay deferred (reference-data admin / read).
export const MAX_ALLOWED = 4;
