---
id: PARITY-VT-6da81bd5
group: setup-and-admin
incumbent: vintrace
capability: Syncing Invoices and Billing Items to QuickBooks
overlap: vintrace-only
status: covered
ourApproach: Transactional outbox emits an immutable ApExportEvent (DR inventory / CR A/P) inside the receive tx; exactly-once poster raises a QBO Bill. Beats InnoVint (no ERP integration).
aiNativeEdge: A credit purchase recorded by receive_supply auto-produces the QBO Bill.
evidence: src/lib/accounting/ap-emit.ts
counterpart: ""
tags:
  - parity
---

# PARITY-VT-6da81bd5 — Syncing Invoices and Billing Items to QuickBooks

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** Vintrace only
- **Our approach:** Transactional outbox emits an immutable ApExportEvent (DR inventory / CR A/P) inside the receive tx; exactly-once poster raises a QBO Bill. Beats InnoVint (no ERP integration).
- **AI-native edge:** A credit purchase recorded by receive_supply auto-produces the QBO Bill.
- **Evidence:** `src/lib/accounting/ap-emit.ts`
- **Source:** `vintrace-docs/setup-and-admin/integrations-accounting/syncing-invoices-and-billing-items-to-quickbooks.md` — see [[assistant-coverage]] / [[system-map]]
