---
id: TRIP-SEC-QBO-TOKEN
group: security
severity: critical
enforce: observe
signal: "a token column read on any cron/system path; a WITHHELD/posted delivery that leaks a token; accounting_enumerator gaining a grant on a token table; a non-CONNECTED connection row holding a ciphertext"
decision: "Phase 15 / SEC-C3,N2,S5"
status: observe
appliesTo:
  - src/lib/accounting/
tags:
  - tripwire
---

# TRIP-SEC-QBO-TOKEN — OAuth token material stays least-privilege + encrypted

> [!warning] Tripwire — revisit when this fires
> A token column read on a cron/system path, a delivery leaking a token, `accounting_enumerator` gaining a grant on a token table, or a non-CONNECTED row holding a ciphertext. Only the refresh token is persisted (AEAD-envelope-encrypted); the access token is memory-only (SEC-N2).

- **What breaks:** a token read outside the per-tenant `app_rls` path, or the least-privilege enumerator role widening, breaks the isolation that keeps one tenant's QBO creds unreadable to the system path.
- **Watch:** the security-posture loop (`/security-review`) checks these; SEC-C4 KEK still env-resident (→ cloud KMS before prod GA).
- **Source:** [[security-register]] (Phase 15), [[system-map]].
