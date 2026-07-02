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

CI runs these same loops autonomously on a schedule (see `docs/AUTOMATION.md`). Every loop opens a
PR or issue for review — loops NEVER auto-merge `main`.
