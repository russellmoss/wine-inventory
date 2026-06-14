# /council — Cross-LLM Review of an Implementation Plan

<!-- Council of Models MCP | tailored for Wine Inventory -->

You run a cross-validation workflow: send an implementation plan (and supporting
docs) to Codex and Gemini for adversarial review, then synthesize their feedback.

## Step 1: Verify MCP server

Confirm you can see `ask_codex`, `ask_gemini`, and `ask_all` from `council-mcp`.
If not, tell the user:

"council-mcp isn't available. It's registered globally (`council-mcp` command).
Make sure `GEMINI_API_KEY` is set in the project-root `.env` — council-mcp reads
it via dotenv. Codex CLI uses its own auth (`codex login`). Then restart the session."

Stop here if the tools aren't available.

## Step 2: Find and read the plan

Read the plan to review. Look in this order:
- The file the user named in `$ARGUMENTS`
- `docs/plans/*.md` (most recent)
- Any `*implementation*.md` / `*build*guide*.md` in the project root

Also read for context: `README.md`, `prisma/schema.prisma`, `AGENTS.md`.
Do NOT read `.env`, `node_modules/`, `.next/`, or anything likely to hold secrets.

## Step 3: Send review prompts in parallel

Tell the user: "Sending to Codex and Gemini for cross-validation..."

Send two tailored prompts (not `ask_all`):

### Prompt A — `ask_codex` (correctness + types + data layer)

```
You are a senior engineer reviewing an implementation plan for a Next.js 16 /
TypeScript / Prisma / Neon Postgres wine inventory app.

Review for:
1. Type safety: every interface/type change — are all construction sites updated?
2. Prisma / schema correctness: field names exist, nullability handled, migrations
   ordered, no N+1 queries, indexes where needed.
3. API route contracts: input validation, error handling, response shape.
4. Phase ordering and missing validation gates.

Structure: CRITICAL / SHOULD FIX / DESIGN QUESTIONS. For each: what's wrong, where,
and the fix.

[FULL PLAN + SCHEMA TEXT BELOW]
```

### Prompt B — `ask_gemini` (product logic + data quality + UX)

```
You are a senior engineer challenging an implementation plan for a wine inventory
app from a product-logic and data-quality angle.

Review for:
1. Domain correctness: vintage/quantity/value math, drink-window logic, unit handling.
2. Data quality edge cases: NULLs, special characters in names, extreme values,
   duplicate bottles.
3. UX: will the inventory views make sense? Sort orders, filters, empty states.
4. Pattern consistency with the existing codebase.

Structure: CRITICAL / SHOULD FIX / DESIGN QUESTIONS. For each: what's wrong, where,
and the fix.

[FULL PLAN + SCHEMA TEXT BELOW]
```

Append the FULL plan text after each prompt. Do not summarize or truncate.

## Step 4: Synthesize

Write `council-feedback.md` in the project root:

```markdown
# Council Feedback — [Plan Name]
**Date**: [today]
**Reviewers**: Codex (types + data layer), Gemini (product logic + UX)

## Critical Issues
## Design Questions
## Suggested Improvements

---
## Raw Response — Codex
## Raw Response — Gemini
```

## Step 5: Present

Summarize findings (3-5 bullets), list critical issues and numbered design
questions, then tell the user to answer the questions and run `/refine` (or feed
the answers back into `/work`). Do not modify any file other than `council-feedback.md`.
