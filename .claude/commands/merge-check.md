# /merge-check — Auto-merge Safety Triage for a PR

Triage a pull request and decide whether it's **safe to merge as-is** or whether
the human **should review it first**. Designed for the assistant-built PRs (e.g. the
thumbs-down / feedback feature) where a bot opens the PR and you want a fast,
trustworthy gate before merging.

**Target:** `$ARGUMENTS`

`$ARGUMENTS` may be a PR number (`123`), a PR URL, or empty. If empty, use the PR
associated with the current branch.

---

## Step 1 — Resolve the PR

```bash
# If $ARGUMENTS is a number/URL, use it; otherwise fall back to the current branch.
gh pr view $ARGUMENTS --json number,title,author,state,isDraft,mergeable,mergeStateStatus,baseRefName,headRefName,additions,deletions,changedFiles,labels,body,url
```

If no PR is found for the current branch, tell the user and stop — ask them for a PR number.

Also pull:

```bash
gh pr diff $ARGUMENTS                       # the full diff
gh pr checks $ARGUMENTS                      # CI / status checks
gh pr view $ARGUMENTS --json reviews,reviewDecision,comments
gh pr view $ARGUMENTS --json files -q '.files[].path'   # changed file paths
```

If the diff is very large, read it in chunks and also list files by path so you can
reason about *what* changed even when you can't quote every line.

## Step 2 — Run the risk checklist

Score the PR against these signals. Each **RED** signal forces "Review required".
Multiple **YELLOW** signals also push toward "Review required".

### 🔴 Red flags (any one ⇒ do NOT auto-merge)
- **Auth / authorization / session logic** changed (`src/lib/auth`, middleware, route guards, role checks).
- **Secrets / env**: new or changed `.env*`, API keys, tokens, or anything that reads `process.env` for credentials. Hardcoded secrets in the diff.
- **Database**: new Prisma migration, `schema.prisma` changes, raw SQL, destructive ops (`DROP`, `DELETE` without scope, `db push --force`). See `AGENTS.md` for the DB stack.
- **Money / inventory integrity**: changes to quantity, value, or location math that could corrupt the cellar inventory.
- **Mass deletion**: large net-negative diff that removes whole files/features without an obvious reason in the PR body.
- **CI failing or pending**: any required check is `fail`/`pending`, or `mergeable` is `CONFLICTING`.
- **LLM trust boundary**: assistant/agent code (`src/lib/assistant/*`, voice tools) that executes model output as DB writes/deletes without validation or scoping — verify `commit.ts`, `scope.ts`, `tools/db-delete.ts` guards are intact.
- **Disabled safety**: removal of tests, type checks, lint rules, or validation/guards.
- **Draft PR** or unresolved "changes requested" review.

### 🟡 Yellow flags (caution — review if several stack up)
- Touches > ~10 files or > ~400 changed lines.
- New runtime dependency added to `package.json`.
- Public API / route signature changes, or client-exposed config.
- UI changes that don't reference DESIGN.md tokens (hardcoded colors/fonts/spacing — see `CLAUDE.md` / `DESIGN.md`).
- No tests added for new logic, or test files unchanged while behavior changed.
- Broad refactor mixed with behavior change in one PR.

### 🟢 Green (lowers risk)
- Small, focused diff scoped to one concern.
- CI green, no conflicts, `mergeable: MERGEABLE`.
- Tests added/updated alongside the change and passing.
- Docs/comments/copy-only or additive, non-destructive change.
- Author is a trusted bot/flow you've vetted before and the change matches its stated purpose.

## Step 3 — Verify, don't just pattern-match

For anything that looks risky, actually read the relevant hunks and the surrounding
code (use Read/Grep) before judging. Confirm:
- Migrations are additive and reversible, not destructive.
- Assistant DB tools still enforce scope/validation before writing or deleting.
- The diff does what the PR title/body claims — nothing extra slipped in.
- No secrets, debug logging of sensitive data, or commented-out safety code.

## Step 4 — Verdict

Output exactly this structure:

```
## Merge check: PR #<n> — <title>
<one-line: what the PR does>

VERDICT: ✅ SAFE TO MERGE  |  ⚠️ REVIEW RECOMMENDED  |  🛑 DO NOT MERGE

Why: <2–4 sentence rationale>

CI: <pass/fail/pending summary>   Mergeable: <state>
Size: +<adds> / -<dels> across <n> files

Findings:
- 🔴/🟡/🟢 <signal> — <file:line if relevant> — <what & why it matters>
- ...

If merging: gh pr merge <n> --squash   (only run if user confirms)
If reviewing: top 1–3 things to look at first: <...>
```

Decision rule:
- **✅ SAFE** only when: CI green, mergeable, no red flags, at most one mild yellow.
- **⚠️ REVIEW** when: yellow flags stack up, or anything is ambiguous and you couldn't fully verify it.
- **🛑 DO NOT MERGE** when: any red flag, CI failing, conflicts, or it's a draft.

## Step 5 — Act only on confirmation

Never merge automatically. If the verdict is ✅ and the user says go, then run the
`gh pr merge` command. Otherwise just report. When in doubt, lean toward
**REVIEW RECOMMENDED** — a false "safe" is far costlier than a false "review".
