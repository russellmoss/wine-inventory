# Phase 6E Semantic-Fit Decision

Date: 2026-07-09
Branch: `codex/phase-6-operations-gaps`

## Decision

Phase 6E does **not** add `DRAIN`, `DELESTAGE`, `COLD_STAB`, or `CUSTOM` to `OperationType`.

The long-tail labels are routed through existing truthful operation families or work-order/process
templates. This keeps the ledger vocabulary controlled and avoids importing incumbent-style labels as
sticky enum values before they have distinct ledger semantics.

| Candidate | Route | Ledger op? | Compliance decision |
| --- | --- | --- | --- |
| `DRAIN` | `LOSS` when the intent is drain-to-waste | Yes | Uses existing `LOSS` / `dump` mapping; bulk loss maps to 5120.17 Part I line A29. Drain-to-move remains `RACK`; drain-to-remove remains deplete/removal. |
| `DELESTAGE` | `SYS-DELESTAGE` work-order template: rack out, then rack back | No single op | Each real rack remains an internal movement unless it records an actual loss. |
| `COLD_STAB` | `SYS-COLD-STAB` work-order/process template | No single op | The process step is non-reportable. Any measured loss, filtration, or material addition uses that existing op family. |
| `CUSTOM` | Controlled label on an existing line shape; v1 supports `LOSS` | Yes, as the selected underlying op | The selected underlying op owns compliance/cost/reversal behavior. The custom label is display/search metadata only. |

## Label Storage

`CUSTOM` uses `LotOperation.metadata.customLabel`, written through helpers in
`src/lib/cellar/long-tail-metadata.ts`. Callers should read labels through `operationDisplayLabel`,
`operationCustomLabel`, or `operationLongTailMarker`; do not parse metadata ad hoc.

## Verifier

`npm run verify:long-tail-ops` proves:

- no new long-tail enum values were added;
- `DRAIN` routes to balanced `LOSS` with `reason = dump`;
- `CUSTOM` routes to balanced `LOSS` with required `metadata.customLabel`;
- existing loss compliance mapping is preserved;
- routed operations reverse through the existing loss reversal path;
- `DELESTAGE` and `COLD_STAB` are covered by work-order templates, not fake ledger ops.
