// -----------------------------------------------------------------------------
// ai-native-allowlist — the RATCHETING escape hatch for verify:ai-native.
//
// A domain core that no assistant tool can reach is normally a CI failure (the
// "talk-to-it" moat leaks). A core may be listed here to defer that — but the
// list can only SHRINK: verify:ai-native asserts entries.length <= MAX_ALLOWED,
// and you lower MAX_ALLOWED each time you wire a tool and remove an entry. You
// never raise it (council C5). Each entry needs a real owner + reason so the
// deferral is a tracked decision, not a silent rug.
//
// Key = the core file path, repo-relative (matches verify-ai-native's `core`).
// -----------------------------------------------------------------------------

export const ALLOWLIST = {
  "src/lib/ferment/panel-core.ts": {
    owner: "winemaking",
    reason:
      "submitPanelCore is the OFFLINE round-capture SYNC core (client-generated panelId/commandId/" +
      "occupancyToken, idempotent outbox drain) — an internal mechanism, not a conversational surface. " +
      "The user-facing capability it serves (record a chemistry panel on a lot) IS assistant-covered by " +
      "record_measurement → recordMeasurementsCore. No direct chat tool is appropriate; this is a " +
      "permanent internal-core exemption, not a backlog gap.",
    issue: "n/a — internal offline-sync core (see record_measurement for the chat surface)",
  },
};

// The ratchet ceiling. Set to the seeded count at landing; only ever DECREMENT.
export const MAX_ALLOWED = 1;
