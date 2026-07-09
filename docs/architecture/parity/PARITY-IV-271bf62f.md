---
id: PARITY-IV-271bf62f
group: make
incumbent: innovint
capability: How to Record a Rack
overlap: both
status: covered
ourApproach: "rackWineCore writes one append-only RACK op in a SERIALIZABLE tx, auto-computes loss to lees, guards capacity, records a 1:1 VesselTransfer; revertTransferCore is a LIFO-guarded correction."
aiNativeEdge: rack_wine + revert_transfer + query_transfers by chat/voice.
evidence: src/lib/vessels/rack-core.ts
counterpart: vintrace-docs/vintrace-web/barrel-management/rack-and-return-of-barrels.md
tags:
  - parity
---

# PARITY-IV-271bf62f — How to Record a Rack

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** rackWineCore writes one append-only RACK op in a SERIALIZABLE tx, auto-computes loss to lees, guards capacity, records a 1:1 VesselTransfer; revertTransferCore is a LIFO-guarded correction.
- **AI-native edge:** rack_wine + revert_transfer + query_transfers by chat/voice.
- **Evidence:** `src/lib/vessels/rack-core.ts`
- **Counterpart article:** `vintrace-docs/vintrace-web/barrel-management/rack-and-return-of-barrels.md`
- **Source:** `innovint-docs/make/movement-actions/how-to-record-a-rack.md` — see [[assistant-coverage]] / [[system-map]]
