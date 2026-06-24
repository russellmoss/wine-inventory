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
- `GEMINI_API_KEY` — read by `council-mcp` from this `.env` for cross-LLM review.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` — reused from the
  Dashboard project for council / research tooling.
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
