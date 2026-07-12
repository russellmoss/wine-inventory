@AGENTS.md

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Plan a feature, "how should we build this" -> invoke plan
- Execute a plan, build it -> invoke work
- Full pipeline, idea to PR -> invoke lfg
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Triage the bug backlog, "smash these bugs", which fixes to merge first, merge no-brainer bug fixes -> invoke bug-triage
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there
(and live in `src/styles/tokens/*.css`; preview at the `/styleguide` route).
Do not hardcode colors, fonts, or spacing — reference the tokens. Do not deviate
without explicit user approval. In QA mode, flag any code that doesn't match DESIGN.md.

## UI QA on this repo (browser testing setup)

**Standard: the in-app Claude browser (`mcp__Claude_Browser__*`), driven against the local dev server.**
CDP-attach via rstack `browse` is **unreliable on this Windows box** — do not burn time on it: `:9222` is
squatted by **Lenovo Vantage** (not a browser with the app session), `browse`'s cookie tooling is
mac/Linux-only, and fresh headless login doesn't persist the session cookie. Use the in-app browser instead.

Flow: start the dev server (`npm run dev`, `localhost:3000`) from the MAIN repo checkout that has the
surface under test (Turbopack hot-reloads edits). Open it with `preview_start`/`navigate`; **the USER logs
in once in the pane** with the Demo Winery creds (`demo@demo.com` / `demo1234`) — never type a password
yourself (safety rule). The pane's session cookie persists across navigations and dev-server restarts.

Reliability gotchas on this box (learned the hard way — treat as rules):
- **Reads:** use `get_page_text` and `read_page` — they're reliable. **Screenshots can hang** in the pane;
  don't depend on them, fall back to the text reads.
- **Text inputs:** `form_input` sets the DOM value but does NOT fire React's `onChange` on a **controlled**
  input (state stays empty → the submit guard blocks with no server call). Use `computer` left_click(ref)
  then `type` for controlled text fields. Native `<select>` works fine with `form_input`.
- **Definitive proof:** for data-write flows, confirm persistence with a short
  `runAsTenant("org_demo_winery", …)` tsx script that reads the rows back — the browser proves the UI, the
  script proves the DB (and dodges the pane's flakiness).

QA rules: all fake-data work is the **Demo Winery** sandbox ONLY (never Bhutan); create `QA-*`-prefixed
fixtures, mutate only those, clean them up after; keep `verify:naming` green before AND after.

**Fallback (headless / CI, no interactive login): the Playwright `storageState` harness.** Log in once with
the Demo creds via the bundled Playwright (`node_modules/playwright-core`, resolved with `createRequire`
rooted at `~/.claude/skills/rstack/browse/package.json`), save `storageState` to a temp JSON, then scenario
scripts load that state (see `qa/PHASE-1-QA-REPORT.md`).

## The "brain" — living docs + automatic maintenance loops
`docs/` is an Obsidian vault (open it at the repo root). `docs/architecture/` holds the
system-map plus three registers that must stay true. Keep them honest:

- **Before proposing architecture** — especially anything touching tenancy, the ledger, cost,
  or data access — read `docs/architecture/scale-register.md` and `docs/architecture/security-register.md`.
- **When building or reviewing UI**, check `docs/architecture/ux-principles.md` (interaction/IA)
  alongside DESIGN.md (visuals).
- **When you make a meaningful architecture/security decision**, append an entry to the relevant
  register (what / why / what-breaks-at-scale / tripwire) and, for big ones, add an ADR under
  `docs/architecture/decisions/`.
- **During `/ship`** (the phase boundary): if the diff since the SHA in `docs/.brain-refresh-marker`
  touched significant code (`prisma/schema.prisma`, `prisma/migrations/`, or
  `src/lib/{tenant,ledger,transform,cost,compliance,auth}`), refresh
  `docs/architecture/system-map.md` + the registers, then write the new HEAD SHA to the marker.

- **Invariant register + auto-enforcement** — `docs/architecture/invariants/` holds one typed note
  per invariant (mirror of `INVARIANTS.md`; fields `severity`/`enforcedBy`/`verify`/`appliesTo`).
  Three background mechanisms use it: (1) `npm run verify:invariants` fails if any invariant's
  `verify:` guard doesn't exist (also run by the local `post-commit` hook, non-blocking); (2) the
  `invariants.base` dashboard; (3) a **PreToolUse hook** (`.claude/hooks/inject-brain-context.mjs`,
  registered in `.claude/settings.json`) that injects the matching invariants into context before any
  edit to governed code (`src/lib/{ledger,tenant,cost,compliance,transform,accounting,commerce,auth}`,
  `prisma/schema.prisma|migrations/`). **When you add an invariant, add a note there too**, then run
  the checker. Obsidian usage (writing `.md`/`.base`/`.canvas`, driving the vault) is covered by the
  `obsidian-*` skills in `.claude/skills/`.

CI runs these same loops autonomously on a schedule (see `docs/AUTOMATION.md`). Every loop opens a
PR or issue for review — loops NEVER auto-merge `main`.
