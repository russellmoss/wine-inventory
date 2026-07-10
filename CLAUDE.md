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

CDP-attach via rstack `browse` is **unreliable on this Windows box** — do not burn time on it:
`:9222` is squatted by **Lenovo Vantage** (not a browser with the app session), and `browse`'s cookie
tooling is **mac/Linux-only** (`cookie-import-browser` reads `~/Library`/`~/.config` paths; `cookie-import`
throws `isPathWithin is not defined`). Fresh headless login doesn't persist the session cookie.

**Standard: the Playwright `storageState` harness.** Log in once with the Demo Winery creds
(`demo@demo.com` / `demo1234`) via the bundled Playwright (`node_modules/playwright-core`, resolved with
`createRequire` rooted at `~/.claude/skills/rstack/browse/package.json`), save `storageState` to a temp
JSON, then every scenario script loads that state. This is cross-platform, needs no CDP port or cookie
decryption, and is what the Phase-1 identity QA used (see `qa/PHASE-1-QA-REPORT.md`). Drive the dev
server from the branch/worktree that has the surface under test (Turbopack hot-reloads edits). QA rule:
create `QA-*`-prefixed fixtures, mutate only those, and keep `verify:naming` green before AND after.

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
