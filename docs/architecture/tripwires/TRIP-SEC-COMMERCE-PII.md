---
id: TRIP-SEC-COMMERCE-PII
group: security
severity: critical
enforce: guard
verify: "test/commerce7-schema.test.ts"
decision: "D19 / Phase 16"
status: guarded
appliesTo:
  - src/lib/commerce/
  - prisma/schema.prisma
tags:
  - tripwire
---

# TRIP-SEC-COMMERCE-PII — no PII column on the DTC projection

> [!warning] Tripwire — revisit when this fires
> A PII-shaped column (name/email/phone/address) added to `commerce7_order` or `sales_export_event`. The projection + deltas + markers + logs must carry ONLY opaque ids + amounts + SKU refs — immutable events conflict with GDPR/CCPA erasure (D19).

- **What breaks:** PII inside append-only events can't be erased without breaking the ledger/lineage; the whole design avoids storing it so there's nothing to shred.
- **Enforced by:** `test/commerce7-schema.test.ts` fails if a PII-shaped column is ever added.
- **Source:** [[security-register]] (Phase 16), [[scale-register]], [[system-map]].
