---
id: PARITY-VT-15cb63c4
group: reporting
incumbent: vintrace
capability: Amending a Previously Submitted 5120.17
overlap: both
status: covered
ourApproach: AMENDED ComplianceReport rows (amendsReportId) re-fold with corrections; cascadeAmendmentsForWrite synchronously marks the downstream FILED chain NEEDS_AMENDMENT in the same tx.
aiNativeEdge: "NEEDS_AMENDMENT is machine-readable → proactive 'period X needs re-filing' nudge."
evidence: src/lib/compliance/amend.ts
counterpart: innovint-docs/make/compliance/declare-or-edit-tax-class.md
tags:
  - parity
---

# PARITY-VT-15cb63c4 — Amending a Previously Submitted 5120.17

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** AMENDED ComplianceReport rows (amendsReportId) re-fold with corrections; cascadeAmendmentsForWrite synchronously marks the downstream FILED chain NEEDS_AMENDMENT in the same tx.
- **AI-native edge:** NEEDS_AMENDMENT is machine-readable → proactive 'period X needs re-filing' nudge.
- **Evidence:** `src/lib/compliance/amend.ts`
- **Counterpart article:** `innovint-docs/make/compliance/declare-or-edit-tax-class.md`
- **Source:** `vintrace-docs/reporting/ttb-usa/amending-a-previously-submitted-5120-17.md` — see [[assistant-coverage]] / [[system-map]]
