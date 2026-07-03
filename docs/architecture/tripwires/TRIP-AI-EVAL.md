---
id: TRIP-AI-EVAL
group: scale
severity: high
enforce: guard
verify: "npm run eval:assistant"
signal: "an AI write surface shipped without an eval suite; a rise in human-corrected proposals; a model/lib bump with no eval delta recorded"
decision: "D26 / H8"
status: guarded
appliesTo:
  - src/lib/assistant/
tags:
  - tripwire
---

# TRIP-AI-EVAL — no AI write surface ships without evals

> [!warning] Tripwire — revisit when this fires
> A new AI-native write surface (NL/voice parsing, OCR, blend-solving) shipped without a golden dataset + regression eval — it "works in the demo" then silently degrades on a model/prompt/library bump.

- **What breaks at scale:** a misparse reaches the proposal step (still caught by human approval per D10, but trust + throughput erode); cellar-language eval data is expensive to build after the fact.
- **Enforced by:** `npm run eval:assistant` + a CI structural coverage guard that fails when a new write tool ships ungoverned.
- **Source:** [[scale-register]] (D26/H8), [[system-map]].
