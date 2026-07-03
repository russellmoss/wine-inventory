---
id: TRIP-SEC-NOSYS
group: security
severity: critical
enforce: static
forbid: "runAsSystem"
in: "src/app"
decision: "Phase 15 / Phase 16"
status: static
appliesTo:
  - src/app/
tags:
  - tripwire
---

# TRIP-SEC-NOSYS — runAsSystem never reachable from an HTTP path

> [!warning] Tripwire — revisit when this fires
> `runAsSystem` (owner, BYPASSRLS) imported anywhere under `src/app/` — the web/HTTP surface. It is migrations/cross-tenant-maintenance only; a request handler that can call it can read across tenants (RLS is bypassed).

- **What breaks:** the app runs as the NOBYPASSRLS `app_rls` role precisely so RLS holds; `runAsSystem` on a request path defeats that.
- **Enforced by:** `npm run verify:tripwires` greps `src/app/` for the identifier and fails if present.
- **Source:** [[security-register]] (Phase 15/16 tripwires), [[system-map]].
