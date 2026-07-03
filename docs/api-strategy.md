# API, MCP & Integration Strategy

> **What this doc is.** The durable design for how the winery ERP exposes and consumes APIs — the
> internal command/query contract, the AI/MCP surface, outbound integrations, and the winery-facing
> public API. It is the reference behind locked decision **D20** (VISION §11) and hardening items
> **H6/H7** (ROADMAP "Cross-cutting architecture & hardening requirements").
>
> **The one idea:** we do **not** build "the app," "the assistant," "the MCP server," and "the
> dashboards" as four systems that each need their own API. We build **one typed tool-contract
> registry** and expose it through several transports. Everything else is a projection of that.
>
> Read alongside: [[architecture/system-map]], [[architecture/security-register]],
> [[architecture/scale-register]], and `VISION.md` §9 (assistant) + §11 (D10, D20).

---

## Why this matters (the competitive frame)

From the 2026-07 research + incumbent-API analysis:

- **Vintrace's API** reads as resource-CRUD (`GET /shipments`, `POST` bulk intake) oriented at
  sales/inventory/dispatch; its accounting sync is **one-way** ("just data dumps" — user review).
- **InnoVint** imports one-way from lab/tank partners and has **no public developer REST API** surfaced
  and **no QuickBooks API** at all (manual reconciliation).
- Incumbents that **"obstruct the exit"** are a documented churn driver.

So the API layer is itself competitive surface on three fronts: (1) **two-way** where they're one-way,
(2) **open + export-friendly** where they trap data, and (3) **AI/MCP-reachable** as a first-class
design goal, not a bolt-on. The moat is not the API — it's that a clean tool contract makes AI-native
cheap for us and expensive for a 15-year-old mutable-schema incumbent to retrofit.

---

## The three tiers

### Tier 0 — The internal domain tool-contract (the spine) · **D20 / H6**

One typed registry of **commands** (writes) and **queries** (reads). Each entry declares its
input/output schema **and its risk class** (`read` · `draft` · `gated-write`, per D10). This registry is
the single source of truth; four surfaces are **projections** of it:

| Surface | How it consumes the registry |
|---------|------------------------------|
| **Web UI actions** | Server actions call the same `*Core` functions the registry wraps. |
| **Assistant tools** | The NDJSON tool-use loop exposes registry entries as tools; risk class → auto-log / draft-confirm / UI-only gating (D10). |
| **MCP server** | A thin transport that re-exposes the **same** entries with the **same** risk boundary + the existing nonce-guarded confirm path (Phase 10). |
| **Dashboard metric catalog** | Read-side registry entries are the allowlisted bindings the AI dashboard spec may reference (Phase 19, curated-catalog-only). |

**Status:** partially built — the repo already splits `*Core` functions from server actions, and the
assistant already calls them behind nonce-confirm. The work of H6 is to **formalize the registry** so
adding a tool once lights up all four surfaces, and the risk class is declared in exactly one place.

**Design rules:**
- A command carries its risk class; the transport enforces it (no transport may downgrade a
  `gated-write` to auto-execute).
- Writes go through the ledger chokepoint (`runLedgerWrite` / `runInTenantTx`) with the D18
  bounded-retry-on-40001 wrapper.
- Reads that are heavy (cost-DAG traversal, cross-lot analytics) are marked so they can be routed
  off the write path (D18 / H3).
- Tenant context is always `SET LOCAL` inside the txn (D17 / H1) — no registry entry may set a
  session-scoped tenant id.

### Tier 1 — Outbound integration adapters (event-driven off the ledger) · **D20 / H7**

**The ledger is already an event stream** — outbound integrations should *subscribe to ledger events*
rather than poll or batch-dump. A `BOTTLE` event → post COGS; a `REMOVE_TAXPAID` event → accrue state
excise. This is the architectural edge over the incumbents' one-way data dumps.

| Integration | Direction | Why (evidence) | Rides phase |
|-------------|-----------|----------------|-------------|
| **QuickBooks Online + Xero** | **two-way** | InnoVint has *no* QBO API; Vintrace's Xero is one-way. Single strongest integration wedge. **QBO connect-slice + posting/reconcile SHIPPED (Phase 15, 2026-07-02); Xero behind the adapter.** | **15 ✅** |
| **ShipCompliant (Sovos) / Avalara** | two-way | State excise + DtC tax + three-tier + product/COLA registration. The real compliance differentiator beyond federal TTB. | 14 (state/DTC) |
| **Pay.gov e-file (TTB)** | outbound | Auto-submit the 5120.17 / 5000.24 we already generate. | 14 (deferred — correct) |
| **Lab inbound** (ETS, FOSS, Anton Paar, WineLab) | inbound | Results auto-attach to lots → feeds D10 auto-log. Table stakes (InnoVint has these). | ~4/6 follow-on |
| **Tank / cellar hardware** (TankNET, VinWizard) | inbound | Sensor data → auto-logged low-risk observations (D10). | ~6 follow-on |
| **Commerce7** (DTC/POS) | two-way | Finished-goods depletion + per-SKU revenue. Our multi-tenancy beats InnoVint's 1:1-constrained link. **BUILT (Phase 16, plan 031) — pending live sandbox verify.** WineDirect drops in behind the same `CommerceAdapter` seam. | **16 ✅ (sandbox-pending)** |
| **Payroll** (QuickBooks Time / Gusto / ADP) | outbound | Export approved hours. | **11** |

**Per-tenant OAuth/token store** (tenant-scoped, RLS-protected) for every connected account.
**Idempotency keys** so re-sync never double-posts.

### Tier 2 — The winery's own public/partner API + webhooks (anti-lock-in) · **D20 / H7**

- **A documented, OAuth2, tenant-scoped REST (or GraphQL) API over the winery's own data** — read
  everywhere, gated writes (same risk classes as Tier 0). Two payoffs: it makes *us* the hub that labs
  and hardware integrate into (not a spoke), and **"your data is yours, here's the API, we'll never
  trap you"** directly attacks the incumbents' roach-motel reputation and lowers switching fear.
- **Webhooks** on ledger events (lot bottled, ferment stuck, compliance-filing due) so partners build
  on us.
- **The import API is the inbound side of this layer** — the Phase-13 migration wedge.

---

## How MCP fits (Phase 10)

MCP is **not a fourth integration** — it is a **second consumer of Tier 0**, aimed at two audiences:

1. **The winery's own staff** driving their winery from an external agent (Claude Desktop, etc.) —
   read anything, draft medium-risk ops, UI-only for lineage-mutating ops.
2. **Agent-to-agent** later (an accounting agent, a compliance agent, a broker's agent).

Because MCP re-exposes the Tier-0 registry, it inherits the read/draft/gated-write boundary and the
nonce-confirm path **for free**. The rule: **never** hand-maintain a separate MCP tool list — generate
it from the registry, or the risk classification will drift between surfaces.

---

## Build order (authoritative)

This mirrors ROADMAP's H-items and interleaves with the feature phases:

1. **Now:** formalize the **Tier-0 registry** incrementally (H6) — every new assistant tool / server
   action declares its risk class in one place. Enforce D17 (`SET LOCAL`) + D18 (retry) on all writes.
2. **Phase 15:** first Tier-1 two-way adapter — **QuickBooks Online** (the open gap), event-driven off
   `BOTTLE` / cost events.
3. **Phase 10 / MCP:** MCP transport over the registry **+** the Tier-2 public API + webhooks (they
   share the same contract, so ship together).
4. **Phase 14 (state/DTC), 16 (DTC/POS), 11 (payroll):** remaining Tier-1 adapters per their phases.
5. **Phase 19:** the dashboard metric catalog binds to the read-side registry (no arbitrary NL→SQL).

---

## Anti-goals

- **No arbitrary NL→SQL** from the AI in v1 (Phase 19) — the LLM emits a schema-validated spec against
  the curated registry; determinism comes from the registry, freedom from composition.
- **No transport may bypass the risk class** — a `gated-write` is UI-confirmed even over MCP/API.
- **No PII in ledger events** (D19) — the public API and webhooks must not leak DTC-customer PII from
  immutable events; PII lives in the mutable, crypto-shreddable store.
- **We do not rebuild the general ledger** — QuickBooks/Xero is the GL; we are the operational + cost
  system of record that feeds it (see ROADMAP Phase 15).

---
*Seeded 2026-07 from the deep-research + incumbent-API pass. Grow it as each integration lands; record
meaningful choices in the context-ledger and the scale/security registers.*
