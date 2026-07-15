---
id: INBOX-1
group: tenancy
severity: critical
enforcedBy: database
verify: "npm run verify:inbox-isolation"
decision: "Plan068"
status: guarded
appliesTo:
  - src/lib/inbox/
  - prisma/schema.prisma
  - prisma/migrations/
tags:
  - invariant
---

# INBOX-1 — recipient isolation

> [!danger] Invariant (critical, database)
> An inbox notification or direct message is readable ONLY by its owner — the notification's recipient, or a participant of the DM thread — even within the same tenant. Enforced by RESTRICTIVE per-user RLS policies keyed on current_setting('app.user_id', true) that AND with tenant_isolation (Unit 1b). A same-tenant actor MAY insert a notification FOR another user (the emit path is INSERT-tenant-only); reads/updates/deletes are owner-only. Unset app.user_id fails closed.

**Guarded by:** `npm run verify:inbox-isolation`
**Decision:** Plan068 — see [[INVARIANTS]] and [[decisions/0005-inbox-notifications]].
**Applies to:** `src/lib/inbox/`, `prisma/schema.prisma`, `prisma/migrations/`

The DB per-user boundary is the real fence; the app-layer `recipientUserId` predicate on every inbox
read is defense in depth (both are asserted by the guard). The tenant (cross-org) dimension is already
auto-covered by [[TENANT-1-rls-isolation]] / `verify:tenant-isolation`.
