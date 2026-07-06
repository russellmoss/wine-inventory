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
      "submitPanelCore (chemistry/tasting panel submission) has no assistant write tool yet — " +
      "it's UI-only via AnalysisPanel. Wire a submit_panel tool + golden eval to remove this and " +
      "lower MAX_ALLOWED to 0.",
    issue: "assistant-coverage backlog (docs/architecture/assistant-coverage.md)",
  },
};

// The ratchet ceiling. Set to the seeded count at landing; only ever DECREMENT.
export const MAX_ALLOWED = 1;
