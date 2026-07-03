---
id: TRIP-NEON-COLDSTART
group: scale
severity: medium
enforce: observe
signal: "intermittent connection/timeout errors (seen as P2028) after idle periods, especially low-traffic → burst transitions"
decision: "Phase 8"
status: observe
appliesTo:
  - src/lib/prisma.ts
tags:
  - tripwire
---

# TRIP-NEON-COLDSTART — serverless Postgres cold starts

> [!warning] Tripwire — revisit when this fires
> Intermittent connection/timeout errors after idle periods (already seen as P2028 on a verify script). Neon serverless Postgres cold-start latency can surface as a timeout on the first request after idle.

- **What breaks:** the first request in a low-traffic → burst transition times out.
- **Next move:** a keep-warm ping / connection-retry on the cold path, or a min-compute setting if it becomes user-visible.
- **Source:** [[scale-register]] (Neon cold starts), [[system-map]].
