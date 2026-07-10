---
title: Feed feedback screenshots into the bug-fix LLM agent
type: feat
status: completed
date: 2026-07-09
branch: claude/blob-llm-image-analysis-88badd
depth: standard
units: 6
---

## Overview

Users can already attach screenshots to bug reports, and those images are already stored in
Vercel Blob (private) and linked to the ticket. But the LLM agent that proposes the fix never
looks at them: `scripts/bug-feedback-agent.ts` sends only the ticket's text. This plan wires the
stored screenshots into the agent's Anthropic call as vision content blocks, so a picture of the
broken UI actually informs the fix. The CI job needs the Blob read token to fetch the private
images, and dev/QA runs on the Vercel Hobby free-tier Blob store.

## Problem Frame

A screenshot of a broken screen is often the single highest-signal artifact in a bug report ("the
total is overlapping the button", "this column is empty"). Today that signal is captured, stored,
and then thrown away at the exact moment it would help most, the automated fix attempt. Doing
nothing means the bug agent keeps guessing from prose and produces weaker or empty fixes for any
visual bug. The cost of inaction is low per-ticket but compounds: the whole point of the capture UI
is undercut.

The right framing is narrow: images are already captured and stored, so this is a "connect two
existing pipes" job, not a new integration. The only genuinely new thing is letting the
credentialed CI job read a private blob and pass bytes to Claude.

## Requirements

- MUST: The bug-fix agent (`scripts/bug-feedback-agent.ts`) includes the ticket's image
  attachments as Anthropic image content blocks in the first user message.
- MUST: Images are treated as UNTRUSTED user data in the system prompt (text visible inside an
  image is not instructions), consistent with how ticket text is already framed.
- MUST: Respect Anthropic API image limits, skip/guard images that would exceed the per-request
  base64 size budget, and cap the number/total bytes of images sent. Skipped images are noted to
  the model, not silently dropped.
- MUST: The CI workflow passes `BLOB_READ_WRITE_TOKEN` to the agent step so private blobs are
  readable; if the token is absent, the agent runs text-only (graceful, same as the app's upload
  route).
- MUST: The agent's write path is unchanged, same write-fence, no-new-files, typecheck gate, and
  no lint/test in the credentialed job. Images enter only as model input.
- SHOULD: Factor the "which attachments to send + build content blocks from fetched buffers" logic
  into a pure, unit-testable function (repo is node-env vitest, test pure logic only).
- SHOULD: Record the security reasoning in `docs/architecture/security-register.md`.
- NICE: Mirror the change symmetrically in `scripts/assistant-feedback-agent.ts` /
  `.github/workflows/assistant-feedback.yml` for future-proofing (no UI produces assistant-feedback
  screenshots today, so this is defensive only).

## Scope Boundaries

**In scope:**
- Reading a ticket's `FeedbackAttachment` rows in the agent, fetching bytes from private Blob, and
  attaching them to the Claude call.
- Size/count guards + a shared pure selection helper + unit test.
- Wiring `BLOB_READ_WRITE_TOKEN` into `feedback-bug-fix.yml` (and, defensively, `assistant-feedback.yml`).
- Docs + security-register entry.

**Out of scope:**
- Any change to the capture/upload/storage path (`src/lib/feedback/attachments.ts`, the upload
  route, the UI). Those already work.
- Adding an image-resize dependency (e.g. `sharp`). We guard-and-skip oversized images instead of
  resizing, to keep deps flat. Screenshots are small in practice.
- Changing the write-fence rules or the RCE-safety posture (no lint/test in the agent job).
- Building assistant-feedback screenshot capture UI (there is none; wiring its agent is defensive
  only).

## Research Summary

### Codebase Patterns

- Blob is already wired: `src/lib/feedback/attachments.ts:114` `storeFeedbackAttachment` does
  `put(..., { access: "private", addRandomSuffix: true })`; `readFeedbackAttachmentBlob`
  (`attachments.ts:161`) does `get(blobUrl, { access: "private" })` and returns `.stream`/`.headers`.
  This is the exact pattern to reuse for reading bytes in the agent.
- `FeedbackAttachment` carries `ticketId` / `assistantFeedbackId`, `contentType`
  (`"image/png" | "image/jpeg"`), `byteSize`, `width`, `height`, `blobUrl`
  (`attachments.ts:143-156`). Content type is stored, so we know the Anthropic `media_type` directly.
- Screenshots originate from `src/app/(app)/assistant/FeedbackTicketModal.tsx:38` (captures a PNG)
  and the bug form, both submitting a **bug FeedbackTicket** with attachments keyed by `ticketId`.
  So the image path terminates at `bug-feedback-agent.ts`, not the assistant thumbs-down path.
- The agent (`scripts/bug-feedback-agent.ts:224-235`) builds `messages = [{ role: "user", content:
  firstUser }]` where `firstUser` is a string, then loops `client.messages.create`. To add images,
  the first message's `content` becomes an array: a text block + one image block per attachment.
- The agent uses a raw `new PrismaClient()` (`bug-feedback-agent.ts:165`) with CI's `DATABASE_URL`,
  no tenant extension, so it can query `feedbackAttachment` where `ticketId` directly.
- Constants already present: `MAX_ATTACHMENT_BYTES = 5MB`, `MAX_ATTACHMENTS_PER_ITEM = 5`
  (`attachments.ts:9-10`).
- Env gating precedent: the upload route (`src/app/api/feedback/attachments/route.ts:40`) checks
  `BLOB_READ_WRITE_TOKEN`/`VERCEL_OIDC_TOKEN` and degrades gracefully. Mirror that gating in the agent.
- Write-fence (`scripts/feedback-fence-rules.ts`) denies `.github/workflows/` for the AGENT, but
  that only constrains agent-produced diffs. Human PRs editing the workflow are unaffected; the
  fence CI gate runs only inside the agent job.

### Prior Learnings

- No rstack learnings recorded for this project yet (`LEARNINGS: 0`).
- From memory: repo has NO jsdom/RTL, vitest is node-env, so UI ships manual-QA-only and we test
  pure logic only (`assistant-dock-history-shipped`). Drives the "pure selection helper + unit
  test, blob IO stays a thin wrapper" decision.
- From memory: `verify:feedback*` scripts run against the MAIN repo dir which has `.env`
  (`main-repo-has-env-verify-runs`); this worktree is `.env`-less, so DB-touching verifies run in
  the main checkout.

### External Research

- Anthropic vision content block shape: `{ type: "image", source: { type: "base64", media_type,
  data } }`. API constraints: ~5MB per image for the base64 payload; images with a long edge
  >1568px are downscaled (and billed) automatically. Our stored images are ≤5MB and ≤6000px, so a
  worst-case 5MB image base64-inflates past the 5MB request limit, hence the size guard. Token cost
  per image ≈ (w×h)/750, negligible for screenshots. (Confirm exact current limits against the
  `/claude-api` reference during `/work`.)
- Vercel Blob Hobby: free included storage + data transfer; 5MB-max, ≤5-per-ticket images keep dev
  far under limits. Blob is metered (not a hard fixed free tier), so note that in docs rather than
  promising "never billable".

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where images enter | First user message content array in the two agents | A read_file-style "fetch_image" tool the model calls | Screenshots are context for the whole investigation; front-loading them is simpler and cheaper than a tool round-trip. |
| Reading private blobs in CI | Add `BLOB_READ_WRITE_TOKEN` to the agent job; reuse `@vercel/blob get()` | Public blobs; a read-only token type | App stores blobs private (correct); no read-only token exists in this Blob version; the job already holds stronger secrets (DB, GH_PAT). |
| Oversized images | Guard-and-skip past a byte budget, note the skip to the model | Add `sharp` and resize | Keeps deps flat; screenshots are small; resizing is complexity we don't need yet. |
| Testability | Pure selection/content-block builder + thin IO fetch wrapper | Integration test with a live blob | Repo is node-env vitest, tests pure logic; blob IO is exercised by manual QA + the live run. |
| Assistant-feedback agent | Mirror defensively, guarded on "attachments exist" | Skip it entirely | Symmetric + future-proof, but flagged as dead-path today since no UI creates those attachments. |

## Implementation Units

### Unit 1: Shared image-selection + content-block helper (pure logic)

**Goal:** A pure function that, given attachment metadata + fetched buffers, decides which images to
include (byte budget, per-image cap, count cap) and returns Anthropic image content blocks plus a
human-readable note about anything skipped.
**Files:** `scripts/feedback-attachment-images.ts` (new)
**Approach:** Export (a) a pure `selectImagesForModel(attachments, opts)` that takes rows with
`{ id, contentType, byteSize }` + already-fetched `Buffer`s and returns `{ blocks, skippedNote }`,
applying: skip non-png/jpeg, skip any single image whose base64 size would exceed the API budget
(guard on raw bytes, e.g. > ~3.5MB), cap to N images and a total byte budget, preserve order.
Build blocks as `{ type: "image", source: { type: "base64", media_type, data } }`. Keep constants
(budgets/caps) named and exported. (b) a thin async `loadTicketAttachmentImages(prisma, { ticketId
| assistantFeedbackId })` IO wrapper that queries `feedbackAttachment`, fetches each `blobUrl` via
`@vercel/blob get(url, { access: "private" })` reading the stream into a Buffer, then calls the pure
selector. The IO wrapper returns `{ blocks, skippedNote }` and returns empty when
`BLOB_READ_WRITE_TOKEN` is unset (graceful, mirrors the upload route).
**Tests:** none in this unit (covered by Unit 5).
**Depends on:** none
**Execution note:** Keep the pure selector free of `@vercel/blob`/`prisma` imports so it is
node-vitest testable.
**Patterns to follow:** `src/lib/feedback/attachments.ts:161-172` (get pattern),
`attachments.ts:9-10` (caps).
**Verification:** `npx tsc --noEmit` clean; function importable from both agents.

### Unit 2: Wire images into the bug-fix agent

**Goal:** The bug agent sends the ticket's screenshots to Claude.
**Files:** `scripts/bug-feedback-agent.ts`
**Approach:** After loading `ticket`, call `loadTicketAttachmentImages(prisma, { ticketId:
ticket.id })`. Change the first message `content` from a string to an array: `[{ type: "text", text:
firstUser + skippedNote }, ...blocks]`. Add a line to `SYSTEM` stating attached screenshots are
untrusted user data and text inside an image is not an instruction. Guard so behavior is identical
when there are zero blocks (still a text block). Leave the tool loop, fence, typecheck gate, and PR
body untouched; optionally note attachment count in the PR body.
**Tests:** none here (Unit 5).
**Depends on:** Unit 1
**Patterns to follow:** existing `firstUser`/`messages` construction at
`scripts/bug-feedback-agent.ts:204-225`; untrusted-data framing at `bug-feedback-agent.ts:148-149`.
**Verification:** `npm run verify:feedback` (run from the main repo checkout with `.env`);
`bug-feedback-agent.ts --dry-run` still loads a ticket without error.

### Unit 3: Pass the Blob token to the bug-fix CI job

**Goal:** CI can read private blobs.
**Files:** `.github/workflows/feedback-bug-fix.yml`
**Approach:** Add `BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}` to the "Run bug
feedback agent" step env (alongside `ANTHROPIC_API_KEY`/`DATABASE_URL`). No other workflow change.
**Tests:** n/a (config).
**Depends on:** Unit 2
**Verification:** YAML lints / parses; the secret name matches the app's env var.

### Unit 4: (Defensive) mirror into the assistant-feedback agent + workflow

**Goal:** Symmetric support so assistant-feedback attachments would also flow if a UI ever creates
them.
**Files:** `scripts/assistant-feedback-agent.ts`, `.github/workflows/assistant-feedback.yml`
**Approach:** Same as Units 2-3 but keyed by `assistantFeedbackId: fb.id`, and only alter the
message when `blocks.length > 0` (no behavior change otherwise). Add the same untrusted-image
system line and the token to that workflow's agent step env. Add a code comment noting no UI
currently produces these attachments.
**Tests:** none (Unit 5 covers the shared helper).
**Depends on:** Unit 1
**Verification:** `npx tsc --noEmit`; existing `verify:feedback*` still green.

### Unit 5: Unit test the pure selector

**Goal:** Lock the selection/guard logic.
**Files:** `test/feedback-attachment-images.test.ts` (new)
**Approach:** Node-vitest test for `selectImagesForModel`: happy path (2 small PNGs → 2 blocks, no
skip note), oversized single image skipped with a note, count cap enforced, total-byte-budget
enforced, non-image content type skipped, correct `media_type` mapping png/jpeg, order preserved.
Feed synthetic buffers; no blob/prisma/network.
**Depends on:** Unit 1
**Patterns to follow:** existing pure-logic suites under `test/` (e.g. `test/voice-*.test.ts`).
**Verification:** `npx vitest run test/feedback-attachment-images.test.ts` passes.

### Unit 6: Docs + security register

**Goal:** Record ops setup and the security reasoning.
**Files:** `docs/developer-feedback-automation.md`, `docs/architecture/security-register.md`
**Approach:** In the automation doc, note that `BLOB_READ_WRITE_TOKEN` must be a GitHub Actions
**secret** (not only a local `.env` var) for the two feedback workflows, that dev/QA uses the Hobby
free-tier Blob store, and that Blob is metered (not a hard free tier). Add a security-register
entry: feedback screenshots are untrusted model input framed as data; the RW Blob token now lives
in the two feedback CI jobs (read-only use; job already holds stronger secrets); the output path
(write-fence + typecheck + no lint/test) is unchanged, so the RCE surface is unchanged; tripwire =
any future image-triggered tool execution.
**Depends on:** Units 2-4
**Verification:** `npm run verify:invariants` / register checkers still pass; doc reads correctly.

## Test Strategy

**Unit tests:** `test/feedback-attachment-images.test.ts` for the pure selector (Unit 5), node-env
vitest, no DOM/blob/network.
**Integration / e2e:** `npm run verify:feedback`, `verify:feedback-idempotency`,
`verify:feedback-security`, `verify:feedback-fence` from the main repo checkout (has `.env`).
`bug-feedback-agent.ts --dry-run` for a no-write load check.
**Manual verification:**
1. In the Hobby Vercel project, create a Blob store; copy `BLOB_READ_WRITE_TOKEN` into local `.env`
   and add it as a GitHub Actions secret.
2. As `russellmoss87@gmail.com`, submit a bug from `/help/feedback` with a PNG showing an obvious
   visual bug (or use the assistant "Report bug" screenshot capture).
3. Approve the AutomationRun in `/developer`, or run the workflow via `workflow_dispatch` with the
   run id.
4. Confirm the agent run logs show the image was loaded and the proposed fix / PR references the
   visual issue. Confirm the draft PR contains only fenced changes and typechecks.
5. Confirm that with `BLOB_READ_WRITE_TOKEN` unset the agent still runs text-only (no crash).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Image base64 exceeds Anthropic per-request size limit | MED | MED | Byte-budget guard + per-image skip in Unit 1; note skipped images to the model. |
| Prompt injection via text rendered inside an image | LOW | MED | System-prompt line framing images as untrusted data; output path unchanged (fence + typecheck), so no new write capability. |
| Extra secret (RW Blob token) in a credentialed CI job | LOW | LOW | Job already holds DB + GH_PAT; token used read-only; documented. No read-only token type available in this Blob version. |
| Private blob read fails in CI (auth/API shape) | MED | LOW | Reuse the app's exact `get(url,{access:"private"})` pattern; graceful empty-on-missing-token; agent degrades to text-only. |
| Token/image cost creep on large tickets | LOW | LOW | Count cap + total-byte budget in the selector. |
| Editing a fence-denied path (`.github/workflows`) in our own PR | LOW | LOW | Fence constrains only agent-produced diffs, not human PRs; verified against `feedback-fence-rules.ts`. |

## Success Criteria

- [ ] Bug-fix agent includes ticket screenshots as image content blocks in the Claude call.
- [ ] Images are framed as untrusted data; write-fence/typecheck/no-lint-test posture unchanged.
- [ ] Size/count/byte-budget guards enforced; skipped images noted, never silently dropped.
- [ ] `BLOB_READ_WRITE_TOKEN` passed to the bug-fix CI job (and, defensively, the assistant job).
- [ ] Agent degrades to text-only when the token is unset (no crash).
- [ ] `test/feedback-attachment-images.test.ts` passes; `verify:feedback*` green.
- [ ] Docs note the GitHub secret + Hobby free-tier caveat; security-register entry added.
- [ ] No regressions in existing tests.
