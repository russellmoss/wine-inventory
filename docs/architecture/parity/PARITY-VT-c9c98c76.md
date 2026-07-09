---
id: PARITY-VT-c9c98c76
group: setup-and-admin
incumbent: vintrace
capability: ETS Lab Integration
overlap: both
status: partial
ourApproach: "Manual Sample workflow (pull → send-to-lab-by-name → record results); 'lab' is free text, no connector, sample-code auto-post, or metric mapping."
aiNativeEdge: pull_sample + manage_sample + record_sample_results make the lab loop conversational.
evidence: src/lib/assistant/tools/pull-sample.ts
counterpart: innovint-docs/make-advanced-features/integrations/innovint-ets-integration-overview.md
tags:
  - parity
---

# PARITY-VT-c9c98c76 — ETS Lab Integration

> [!info] Parity (vintrace) — partial — see below.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** Manual Sample workflow (pull → send-to-lab-by-name → record results); 'lab' is free text, no connector, sample-code auto-post, or metric mapping.
- **AI-native edge:** pull_sample + manage_sample + record_sample_results make the lab loop conversational.
- **Evidence:** `src/lib/assistant/tools/pull-sample.ts`
- **Counterpart article:** `innovint-docs/make-advanced-features/integrations/innovint-ets-integration-overview.md`
- **Source:** `vintrace-docs/setup-and-admin/integrations-labs-and-tanks/ets-lab-integration.md` — see [[assistant-coverage]] / [[system-map]]
