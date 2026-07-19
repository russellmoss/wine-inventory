# Automation — the self-maintaining "brain"

> A set of **agentic loops** that keep this project's knowledge, security, scale, and UX honest
> *without you having to remember to run anything*. Hybrid design: cheap **local** detectors fire
> instantly; the **smart passes** run in GitHub Actions on a schedule and open PRs/issues you review.
> Related: [[_index]], [[system-map]], [[scale-register]], [[security-register]], [[ux-principles]].

## The golden rule
**Every loop produces a reviewable artifact (a PR or an issue). No loop ever auto-merges `main`.**
You stay in control; the loops just make sure the work *starts itself*.

---

## The loops

| # | Loop | Runs | Trigger | Output |
|---|------|------|---------|--------|
| — | **Local detector** | your machine | every `git commit` | terminal nudge if significant code changed (no file writes) |
| 1 | **Brain refresh** | GitHub Actions | nightly + manual | PR updating `system-map` + registers + drifted invariant notes, if code drifted |
| 2 | **Security sweep** | GitHub Actions | weekly + on sensitive-path push + manual | GitHub **issue** if tenant/RLS/auth/secret drift found |
| 3 | **Scale tripwire** | GitHub Actions | weekly + manual | GitHub **issue** if a `scale-register` tripwire is approaching |
| 4 | **UX consistency** | GitHub Actions | on PRs touching UI + manual | PR review comments vs `ux-principles.md` |
| 5 | **Knowledge re-crawl** | GitHub Actions | weekly + manual | refreshes the GLOBAL knowledge corpus (re-embed changed / add new / tombstone 404s); GitHub **issue** with the run summary |

Workflow files live in `.github/workflows/`. The local hook is `.githooks/post-commit`.

### The one loop that writes data (knowledge re-crawl)
Loops 1–4 are read-only analysis (they only open PRs/issues). Loop 5 (`knowledge-recrawl.yml`,
Plan 079 Unit 12) is different: it runs a deterministic script (`scripts/recrawl-knowledge.ts`), not an
LLM, and it **mutates the GLOBAL knowledge corpus** — never any tenant data. It re-crawls each active
`KnowledgeSource` with conditional GET (a 304 skips re-embedding), re-embeds only changed pages into a
new chunk revision with an atomic flip, adds newly-discovered pages, and **tombstones** any active doc
that now 404s (`status='withdrawn'`, rows kept for audit, excluded from retrieval). Every change is
reversible and self-correcting — a re-reached doc flips back to `active` next run — so the corpus stays
fresh without a human in the write path, and the issue it opens is the audit trail. It still obeys the
golden rule: it never touches code and never merges `main`. Single-flight (`concurrency:`) so two runs
can't race on chunk revisions. Run it manually with a `max_docs` input for a bounded smoke test.

### How the brain-refresh loop knows what's stale
`docs/.brain-refresh-marker` holds the commit SHA the docs were last refreshed at. The loop diffs
`marker..HEAD`; if anything under `prisma/schema.prisma`, `prisma/migrations/`, or
`src/lib/{tenant,ledger,transform,cost,compliance,auth}` changed, it refreshes and advances the marker.
The `/ship` flow does the same thing locally (see the brain section in `CLAUDE.md`), so the marker
stays current whether the refresh happened in CI or during a ship.

### Invariant-drift review (part of the brain-refresh loop)
The loop also runs `node scripts/check-invariant-drift.mjs` (deterministic, no LLM): it flags
invariants in `docs/architecture/invariants/` whose **governed code changed but whose note did not**
over `marker..HEAD`. That's the gap `npm run verify:invariants` can't catch — the guard still *exists*
(green) while the written rule may have gone stale, which would make the auto-context hook inject a
wrong rule. For each flagged invariant the loop reviews the note against the changed code and updates
it (and the `INVARIANTS.md` line) in the same PR. Pure core is unit-tested (`test/invariant-drift.test.ts`);
run it anytime with `npm run check:invariant-drift`.

---

## Activation (one-time)

The local layer works as soon as you enable the hook. The CI loops activate once you add one secret.

### 1. Enable the local commit detector
```bash
git config core.hooksPath .githooks
```
(That's it — the hook is version-controlled in `.githooks/` so it also travels to future teammates.)

### 2. Add your Anthropic API key to GitHub (turns on all four CI loops)
1. Get a key at **console.anthropic.com** (a non-expiring key is fine).
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it exactly **`ANTHROPIC_API_KEY`**, paste the key, save.

That is the only secret required — GitHub provides `GITHUB_TOKEN` automatically for PR/issue creation.

### 3. (Optional) Feed live production data to the scale loop
Add a read-only **`DATABASE_URL_UNPOOLED`** secret and uncomment the "Dump Neon slow queries" step in
`.github/workflows/scale-tripwire.yml`. Then the scale loop reasons over *real* slow-query stats.

### 3b. Turn on the knowledge re-crawl (loop 5)
Add two secrets: **`DATABASE_URL_UNPOOLED`** (the Neon **owner** URL — the re-crawl writes the global
corpus, which needs `BYPASSRLS`) and **`VOYAGE_API_KEY`** (embeddings). Without them the loop no-ops.
Trigger it once from the Actions tab with a small `max_docs` (e.g. `5`) to smoke-test before the weekly
schedule takes over. This is the only loop that needs write-capable DB creds — the analysis loops don't.

### 4. Test before trusting
Every workflow has a **manual trigger**: GitHub → **Actions** tab → pick a workflow → **Run workflow**.
Run each once to confirm it behaves, then let the schedules take over.

---

## Cost & safety notes
- Loops are capped (`--max-turns`) and use **Sonnet 5** for the read-only analysis loops, **Opus 4.8**
  only for the doc-refresh that needs judgment. Read-only loops can't edit code (`--allowedTools "Read,Bash"`).
- Scheduled runs count toward Anthropic API spend — set a budget in the console if you want a hard cap.
- If a loop ever gets noisy or wrong, disable it: GitHub → Actions → the workflow → **⋯ → Disable**,
  or delete its `.yml`. Nothing else depends on it.

---
*Set up 2026-07-02. Loop 5 (knowledge re-crawl) added 2026-07-19. Add a row to the table whenever you add a loop; keep the golden rule.*
