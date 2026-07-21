<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Wine Inventory

A wine cellar inventory app. Track bottles: producer, vintage, varietal, region,
quantity, location, value, and drink-window. Built to develop with the rstack
agentic toolchain (council review, context-ledger, agent-guard).

## Stack

- **Next.js 16** (app router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Prisma** ORM → **Neon Postgres**
- Prisma client singleton: `src/lib/prisma.ts`
- Schema + models: `prisma/schema.prisma`

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # eslint
npm run db:push      # push schema to DB (no migration history)
npm run db:migrate   # create + apply a migration
npm run db:studio    # open Prisma Studio
npm run db:generate  # regenerate Prisma client
```

## Environment

Secrets live in `.env` (gitignored). Template is `.env.example`.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon Postgres (pooled / direct).
  - **Multi-tenancy role split (Phase 12):** migrations run as the OWNER via
    `DATABASE_URL_UNPOOLED` (owner carries `BYPASSRLS`). The runtime app connects (pooled) as the
    dedicated non-owner **`app_rls`** role (`NOBYPASSRLS`, non-superuser) so Postgres RLS actually
    enforces tenant isolation. `DATABASE_URL_APP` holds the app_rls pooled URL; at activation it
    becomes `DATABASE_URL` here and in Vercel. Set/rotate the app_rls password with
    `npx tsx --env-file=.env scripts/setup-app-rls-credential.ts` (owner-run; secret never committed).

## Testing tenant: use "Demo Winery", never Bhutan Wine Co.

All dev/QA/fake-data work runs in the **Demo Winery** sandbox tenant (`org_demo_winery`), NOT the real
**Bhutan Wine Co.** (`org_bhutan_wine_co`) tenant. RLS keeps them isolated. Create/refresh the sandbox
with `npm run seed:demo-tenant` (idempotent; owner login printed on run — default
`owner@demowinery.test`). In scripts, wrap seeding/test writes in `runAsTenant("org_demo_winery", …)`.
The in-app tenant *switcher* ("god mode", ROADMAP Phase 21a) is not built yet — until then, access Demo
Winery by logging in as its own user. Do not generate test data in Bhutan Wine Co.

## Multi-tenancy: adding a new tenant-scoped table (Phase 12 checklist)

Every domain/registry table is tenant-scoped and RLS-isolated. When you add one, ALL of these or
you get a leak (missing RLS) or a broken table (missing context). Auth/org tables (User/Session/
Account/Verification/organization/member/invitation) are the ONLY globals — never add tenantId to them.

1. `tenantId String @default("")` + `@@index([tenantId])` on the model (the `@default("")` makes it
   type-optional at create sites; the real value is auto-injected — never a leak, `''` fails FK/RLS).
2. Migration: add the `tenantId` column + index + FK → `organization(id)` (ON DELETE RESTRICT).
3. Backfill existing rows to the correct tenant, then `ALTER COLUMN "tenantId" SET NOT NULL`.
4. Per-tenant uniques: any global unique becomes `@@unique([tenantId, ...])` (recreate the index).
5. If other tenant tables reference this one via a cross-tenant-risk FK (lineage/ledger), add a
   `@@unique([tenantId, id])` here and make that FK composite `(tenantId, refId) → (tenantId, id)`.
6. RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy with USING **and**
   WITH CHECK on `current_setting('app.tenant_id', true)` (fail-closed). Add it to the U7 checklist.
7. Do NOT add the model to the extension denylist (`src/lib/tenant/models.ts` GLOBAL_MODELS).
8. Grant app_rls DML (covered by the default privileges from migration `..._app_rls_role`).
9. Add a case to `scripts/verify-tenant-isolation.ts` / `test/tenant-isolation.test.ts`.

Recent tables built to this checklist (Phase 14 / TTB compliance): `compliance_report`, `compliance_profile`
(migrations `..._compliance_schema` + `..._compliance_rls`). Their FKs, per-tenant uniques, RLS
policies, and app_rls grants follow steps 1–8 verbatim; end-to-end proof is `npm run verify:ttb`.

Phase 14 v1.1 (plan 026, TTB F 5000.24 wine excise return) added COLUMNS only — no new tables, no RLS
change: `ComplianceReport.formType` (a `ComplianceFormType` discriminator so ONE table backs both the
5120.17 and the 5000.24) + `taxDollars`; `ComplianceProfile.defaultReturnCadence` + `isEftPayer`;
`SEMIMONTHLY` added to `ReportCadence` (isolated `ALTER TYPE` migration, committed before any column
defaults to it — the Windows enum rule). CRITICAL: every `compliance_report` query is `formType`-scoped
via `src/lib/compliance/form-type.ts` (`OPS_FORM`/`EXCISE_FORM`/`formScope`) or the two forms' filing
chains cross (an excise return would corrupt the 5120.17 carry-forward). End-to-end proof: `npm run verify:excise`.

App access: reads/writes go through the extended `prisma` (tenant auto-resolved from the session or
runAsTenant). The ledger uses `runLedgerWrite`; other tx use `runInTenantTx`; scripts wrap their
entry point in `runAsTenant(tenantId, …)`; cross-tenant maintenance uses `runAsSystem` (owner). Never
read the ALS tenant inside a cached fn (K12) — pass tenantId as an explicit arg.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` — optional
  "Sign in with Google" (LOGIN only; non-sensitive `email`/`profile` scopes → no Google security
  review, no Workspace needed; NOT Gmail access). Wired in `src/lib/auth.ts` via Better Auth's
  `socialProviders.google` with `disableSignUp: true` + `account.accountLinking` — a Google login
  never creates a user, it links to the EXISTING admin-created account with the same email; an
  unknown email is refused. Unset creds → the login-page button is hidden. Redirect URI is
  `/api/auth/callback/google`; `BETTER_AUTH_URL` must match the origin. Full setup in `.env.example`.
- `GEMINI_API_KEY` — read by `council-mcp` from this `.env` for cross-LLM review.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` — reused from the
  Dashboard project for council / research tooling.
- `ELEVENLABS_API_KEY` — assistant voice mode, BOTH directions: text-to-speech and
  speech-to-text (Scribe) run on this one key (no OpenAI needed). Reuse the same key
  from the `horseplay` project's `.env`. Optional overrides: `ELEVENLABS_VOICE_ID`
  (default `UgBBYS2sOqTuMpoF3BR0`), `ELEVENLABS_MODEL_ID` (default
  `eleven_flash_v2_5` — lowest latency for real-time conversation; `eleven_turbo_v2_5`
  also works), `ELEVENLABS_STT_MODEL` (default `scribe_v1`), `ELEVENLABS_STABILITY`
  (0.45), `ELEVENLABS_SIMILARITY_BOOST` (0.75), `ELEVENLABS_STYLE` (0.0),
  `ELEVENLABS_SPEAKER_BOOST` (true).
  Unset → the "Talk" button is hidden and the assistant stays text-only.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — optional. Google Map Tiles API key for the
  vineyard satellite basemap (`src/components/ui/SatelliteMap.tsx`). Client-exposed
  by design (restrict by referrer + Map Tiles API in Cloud Console). Unset → the
  map falls back to keyless Esri World Imagery. Map deps: `leaflet` +
  `@geoman-io/leaflet-geoman-free` (interactive polygon draw/edit/snap; no
  react-leaflet). Both stylesheets are imported once in the root layout
  (`src/app/layout.tsx`) — App Router only allows global CSS at the root.
  Imagery is keyless Esri unless this key is set. The map's opt-in "History"
  mode uses the keyless Esri World Imagery Wayback archive
  (`src/lib/map/wayback.ts`) — no key, no env. The map's "Export" menu writes a
  PNG (DOM capture via `html-to-image`; tile layers set `crossOrigin`) or a
  zipped WGS84 shapefile of the drawn blocks with all block metadata in the DBF
  (`@mapbox/shp-write`); both libs are dynamically imported on the client only.

## Assistant voice mode

Hands-free "talk to the assistant" mode (Jarvis-style). Opens from a "Talk" button
in the chat (`src/app/(app)/assistant/AssistantChat.tsx`) into a full-screen overlay.

- Loop: listen (mic + VAD) → transcribe (server) → think → speak → listen. It reuses
  the exact same `/api/assistant` NDJSON stream + tool-use loop as the text chat, so
  there is one assistant brain and history is shared/mirrored across modes.
- Routes: `POST /api/assistant/transcribe` (ElevenLabs Scribe STT over a recorded
  utterance) and `POST /api/assistant/speak` (streams ElevenLabs MP3 per sentence).
  Key stays server-side; both are auth-gated.
- Server libs in `src/lib/voice/`: `config` (keys/gates), `elevenlabs` (TTS),
  `transcribe` (STT), plus pure isomorphic logic — `speech` (markdown→spoken),
  `sentence-chunker` (stream→sentences), `vad` (end-of-speech), `audio-queue`
  (ordered playback). The pure logic is unit-tested in `test/voice-*.test.ts`.
- Client in `src/app/(app)/assistant/voice/`: `useMicCapture`, `useAudioPlayback`,
  `useVoiceSession` (state machine), `AudioVisualizer` (canvas orb, design tokens,
  reduced-motion aware), `VoiceOverlay`. Lazy-loaded, no new runtime deps (raw fetch
  + Web Audio + MediaRecorder).
- Requirements: HTTPS (or localhost) + mic permission; best in Chrome/Edge/Safari.
  Write actions still require explicit confirmation (signed-token / single-use nonce
  path is unchanged) — voice can confirm by tap or by saying "confirm".

## Commerce7 DTC/sales integration (Phase 16)

The revenue side of the money loop: pull settled Commerce7 DTC/club/POS **sales** in, deplete
finished-goods inventory (a `SALE` `StockMovement`), post **DTC revenue** through the SAME Phase-15
`AccountingDelivery` outbox/poster, and mirror finished-goods **increases** back to Commerce7. ERP is
authoritative; Commerce7 is a downstream **replica** (D20). Built (plan 031, `src/lib/commerce/`) and
proven offline; **live sandbox verification is pending** (see `docs/plans/phase-16-go-live-runbook.md`).

- **Auth: NOT OAuth.** App ID + Secret Key (Basic Auth) + a `tenant:` header, all **env-resident**
  (`COMMERCE7_APP_ID`/`COMMERCE7_SECRET_KEY`/`COMMERCE7_WEBHOOK_SECRET`/`COMMERCE7_INSTALL_URL`). No token
  table. Install is **nonce-bound** (reuses `OAuthState`); the callback's `tenantId` is the C7 slug ONLY.
- **Order model:** a MUTABLE `Commerce7Order` projection (PII-free) → normalize → **diff** → append-only
  `SalesExportEvent` **DELTAs** (`postingKey = sale:${orderId}:v${seq}`). Orders are mutable — never a
  single immutable snapshot. Paid-only economics (`diff.ts` recognizes settled states); a cart/unpaid
  order posts/depletes nothing; refund/cancel = a signed reversal delta (D6).
- **Ingest is one SERIALIZABLE `runLedgerWrite` tx** (delta + `SALE` depletion + PENDING delivery) →
  exactly-once + atomic. The webhook is a HINT (bounded dirty marker); the **poll cron is the single
  ingest path** + the `(updatedAt,id)` cursor backstop. Unmapped SKU/account → **withhold** (re-emits
  after mapping via the poll's withheld sweep).
- **Outbound inventory** is additive-on-**increase** only (RECEIVE / positive ADJUST), claim-first
  watermark idempotency; NEVER pushes a `SALE`/negative (C7 already decremented). Drift is **detected +
  surfaced, never auto-written**.
- **Revenue posting** reuses the Phase-15 poster (a `salesExportEventId` branch → `buildSalesDeltaJournal`:
  DR undeposited-funds clearing / CR revenue+tax+shipping / DR discount contra; each delta posts the
  difference). The delivery source CHECK is now **exactly-one-of-three** (cost | ap | sales).
- **PII (D19):** the projection + deltas + markers + logs carry only opaque ids + amounts + SKU refs —
  a schema test (`test/commerce7-schema.test.ts`) fails if a PII column is ever added.
- Proof: `npm run verify:commerce7` (e2e loop) + `npm run verify:commerce7-idempotency` (exactly-once).
  Known accounting gaps (processor-fee/payout tie-out, DR/CR direction, A/R) are in the go-live runbook —
  **confirm with an accountant** before relying on the DTC cash tie-out.

## rstack toolchain

Skills (`/plan`, `/work`, `/lfg`, `/review`, `/ship`, `/qa`, `/investigate`,
`/guard`, `/careful`, etc.) and the MCP servers (`council-mcp`,
`context-ledger-mcp`, Neon) are installed globally and available here.

When a request matches a skill's purpose, invoke the skill (don't answer ad-hoc):
- New idea / "is this worth building" / brainstorm → `/office-hours`
- Plan a feature / "how should we build this" → `/plan`
- Execute a plan / "build this" → `/work`
- Full pipeline idea→PR → `/lfg`
- Bug / error / "why is this broken" → `/investigate`
- Review the diff before landing → `/review`
- Cross-LLM adversarial review of a plan → `/council` (Gemini + Codex)
- QA / test the site → `/qa`
- Ship / deploy / open PR → `/ship`
- Second opinion → `/codex`
- Safety / careful mode → `/careful` or `/guard`
