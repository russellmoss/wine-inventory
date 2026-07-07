# Vintrace v7 — Identity API

OpenAPI 3.0.3. Source spec: `vintrace-docs/api/specs/identity-api-v7.yaml`.

**Server base URL**
- Production (example): `https://oz50.vintrace.net/vinx2/api/v7/identity`
- Sandbox (example): `https://sandbox.vintrace.net/vinx2demo/api/v7/identity`

**Auth**: `bearerAuth` — HTTP Bearer token (Vintrace API token). All endpoints require it.

**Cross-cutting**
- Optional `correlation-id` request header (uuid); echoed back on every response.
- Errors: `default` response returns `{ errors: [{ code, message, detail }] }` (400/401/403/404/409).
- List responses are page-wrapped (`PageRoot`): `totalResults`, `offset`, `limit`, `first`, `previous`, `next`, `last`, `results`.

Scope note: this API is **narrow** — it manages only the shared **party/contact master** (people and organizations that a winery deals with). It does not touch wine, vessels, stock, or compliance data; those live in the other v7 specs (`vessel`, `stock`, `operation`, `harvest`, `costs`, `report`, `account`).

---

## Endpoints

### GET /parties — Search parties
Search the party master, optionally filtered.

Query params:
- `governmentNumbers` (string) — comma-delimited list; only parties with these government numbers.
- `roles` (string) — comma-delimited list (e.g. `grower,carrier`); only parties with these roles.
- Pagination via the standard `offset` / `limit` query params (reflected in the page links).

Response: `GetPartiesSuccessResponse` = page envelope + `results: Party[]`.

Key result fields per party: `id`, `extId`, `type`, `roles[]`, `organizationName` / `givenName`+`surname`, `contactNumbers[]`, `email`, `address`, `governmentNumber`.

### POST /parties — Upsert a party
Create (no `id`) or update (with `id`) a single party. Request body = `Party`. Response: `UpsertPartySuccessResponse` = `{ data: Party }`.

Note: `UpsertPartyRequest` extends `Party` with **deprecated** flat phone fields (`mobilePhone`, `businessPhone`, `homePhone`) kept for backward compatibility — prefer the structured `contactNumbers[]`.

---

## Key schemas

### Party
The core master record for any counterparty (person or organization).
- `id` (int32) — Vintrace id; omit to create, supply to update.
- `type` (**required**, `PartyType`) — one of the party-type enum values.
- `extId` (string) — id of this party in an external system (useful as a migration correlation key).
- `roles[]` (`PartyRole[]`) — the roles this party plays.
- `organizationName` — required when `type` is an organization.
- `givenName` + `surname` — required when `type` is a person.
- `contactNumbers[]` (`PhoneNumber`), `email`.
- `address`, `postalAddress`, `billingAddress` (all `Address`).
- `governmentNumber` — government identifier (e.g. tax/registration number).

### PartyType / PartyRole (same enum)
`carrier`, `cooper`, `customer`, `grower`, `laboratory`, `owner`, `vendor`, `distributor`, `harvester`.

### Address
`id`, `mailingName`, `street1`, `street2`, `city`, `state`, `postalCode`, `country`.

### PhoneNumber
`id`, `type` (**required**: `MOBILE` | `BUSINESS` | `HOME` | `FAX`), `areaCode`, `number`, `extension`.

---

## Migration notes (current-state pull)

- The Identity API is a clean single source for the **parties / counterparties** master. A full current-state pull is `GET /parties` paged to exhaustion (optionally per-role).
- `extId` is the natural correlation key back to whatever the winery had before Vintrace, and is a good idempotency anchor when re-importing.
- Every winery-relationship type collapses into one Party record differentiated by `type`/`roles`: **growers** (fruit sourcing), **customers/distributors** (sales), **vendors** (AP/purchasing), plus carriers, coopers, laboratories, owners, harvesters.
- No history/audit here — a Party is current-state only. Relationship *usage* (which grower supplied which fruit, which customer bought which wine) is expressed in the operation/harvest/stock/sales APIs, not here.
