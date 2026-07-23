export const meta = {
  name: 'bug-triage',
  description: 'Product-goalie bug-triage team: reconcile the feedback backlog against git (close out bugs whose fix already merged — including work that shipped in a hand-built PR nothing ever stamped on the ticket), CLUSTER duplicates (incl. across tenants) so one deployed solution closes every reporter, prioritize what is genuinely active, root-cause-vet every open fix PR (real fix vs cosmetic band-aid), surface PLANNED (plan-mode) outcomes for review and carry SKIPPED reasons forward, then act — dispatch fixes for NEW no-brainers, auto-merge the tight-gate PRs, and WRITE STATUS BACK (fanning out to every ticket in a cluster) so the queue reflects reality. Queues the rest for a human with a verdict.',
  whenToUse: 'When you want the reported-bug backlog worked end-to-end and kept honest: already-shipped bugs closed out (even when the fix PR was hand-built and never linked), duplicate reports across tenants collapsed to ONE fix, active ones prioritized, fixes sanity-checked for root cause, plans/skips surfaced, safe fixes dispatched/merged, and each item (and its duplicates) written back to its true status.',
  phases: [
    { title: 'Intake' },
    { title: 'Reconcile' },
    { title: 'Cluster' },
    { title: 'Prioritize' },
    { title: 'Review' },
    { title: 'PR Sweep' },
    { title: 'Merged Sweep' },
    { title: 'Issue Sweep' },
    { title: 'Act' },
    { title: 'Parallelize' },
    { title: 'Report' },
  ],
}

// ---------------------------------------------------------------------------
// SAFETY MODEL (chosen by the user):
//   - ACTIVE vs CLOSED: an item is CLOSED if its DB status is RESOLVED/DISMISSED
//     OR its fix PR is already MERGED. Closed items are never re-triaged; a merged
//     PR whose item still says NEW/TRIAGED is RECONCILED (written back to RESOLVED)
//     so the queue stops lying. Only genuinely-active items get worked.
//   - ALREADY-SHIPPED (the MERGED SWEEP): the reconcile above only fires when the ticket
//     CARRIES the PR (prNumber non-null), and the open-PR sweep only sees PRs that are
//     still OPEN. So work that shipped in a HAND-BUILT PR — one no automation ever
//     stamped onto the ticket — is invisible to both, and triage happily re-offers
//     production code as new work. (Observed 2026-07-23: ticket cmrwdgt2u… was ranked
//     the run's one actionable "plan-ready" item pointing at plan issue #466, after the
//     work had shipped the day before in PR #468.) The Merged Sweep closes that hole: it
//     scans RECENTLY MERGED PRs, pulls a cuid-shaped feedback id out of each PR BODY
//     (phrasings vary — "Closes the feedback item `<id>`", "Automated fix from bug ticket
//     `<id>`" — so it matches on shape+proximity, not one template), resolves each id
//     against DB truth with the read-only `triage:lookup`, and reconciles to RESOLVED
//     ONLY when the ticket is still open. An already RESOLVED/DISMISSED ticket is never
//     rewritten, and a hallucinated/garbled id simply comes back `missing` from the
//     lookup and is dropped — the DB is the validator, not the regex.
//   - CLUSTER/DEDUP: the auto-fix fence is tenant-agnostic app code, so ONE PR fixes
//     a bug for ALL tenants. Active items are grouped by likely root cause (across
//     tenants) BEFORE prioritize. Each cluster elects ONE primary (furthest-along
//     wins: open-PR > PLANNED > awaiting-dispatch > NEW); only the primary is
//     prioritized/reviewed/dispatched/merged. Every status write-back FANS OUT to the
//     whole cluster, so one solution closes every reporter. Clustering is conservative
//     (default to singleton when root-cause identity is uncertain). cluster=false off.
//   - PLAN-MODE / SKIP awareness: a PLAN run leaves the item PLANNED with a plan
//     stored in planMarkdown and/or a GitHub issue (githubIssueUrl). It is NEVER
//     re-dispatched — it is surfaced (link + snippet) and written to TRIAGED "plan
//     ready — run /work". A SKIPPED run declined; its reason rides developerNotes and
//     is carried into the queue (dismiss if not-a-bug/wontfix, else needs-human).
//   - TIGHT auto-merge only. A PR auto-merges ONLY if ALL hold: feedback-fence-only
//     (src/app/(app), src/app/api/feedback, src/components, src/lib/assistant),
//     CI fully green + MERGEABLE, root-cause fix (not cosmetic/band-aid), merge-safe
//     (no red/stacked-yellow flags), small (<= ~150 lines, <= ~8 files). Else queued.
//   - CLOSE THE LOOP: every action writes status back via `npm run triage:resolve` —
//     RESOLVED (merged/reconciled), DISMISSED (rejected as not-a-bug/noise), or
//     TRIAGED + verdict note (handed to a human / plan ready). Nothing at NEW.
//   - Dispatch reuses the real pipeline (`npm run triage:dispatch` == the /developer
//     Approve button). Branch protection on main is the backstop — never --admin.
//   - dryRun=true => plan + review + cluster + runbook only; NO merges, dispatches, writes.
//   - FAIL CLOSED on args: if args are supplied but malformed (e.g. a JSON string that was
//     not parsed), the run CLAMPS TO DRY RUN rather than falling through to the live
//     defaults. The resolved mode is logged at the start of Intake AND returned as `mode`.
//
// args (all optional):
//   { autoMerge?: boolean=true, dispatch?: boolean=true, reconcile?: boolean=true,
//     cluster?: boolean=true, dryRun?: boolean=false, maxMerges?: number=5,
//     maxDispatch?: number=5, sweepPrs?: boolean=true, maxSweepMerges?: number=5,
//     sweepIssues?: boolean=true, maxIssueCloses?: number=10,
//     sweepMergedPrs?: boolean=true, maxMergedScan?: number=50, mergedSinceDays?: number=14,
//     mergedSince?: string /* ISO date; overrides mergedSinceDays */, maxMergedReconcile?: number=20,
//     tenantQuery?: string, today?: string /* ISO date for the runbook header */ }
//   sweepMergedPrs=true also scans the RECENTLY MERGED PRs (bounded by maxMergedScan and a
//   mergedAt cutoff) for feedback ids in the PR body, and reconciles any STILL-OPEN ticket to
//   RESOLVED — catching work that shipped in a PR the automation never stamped on the ticket.
//   Capped by maxMergedReconcile. dryRun reports what it WOULD reconcile and writes nothing.
//   sweepPrs=true also triages EVERY open PR (not just feedback-linked): auto-merges gate-passers
//   (un-drafting a finished draft first), RECOMMENDS closes for superseded/duplicate/stale PRs
//   (never auto-closes), and queues fix-first / needs-human. dryRun reports all of this, acts on none.
//   sweepIssues=true also triages EVERY open GitHub issue: auto-CLOSES a "feedback: plan" issue whose
//   source ticket is provably RESOLVED/DISMISSED (mechanical reconciliation, capped by maxIssueCloses),
//   and RECOMMEND-closes Sentry noise / already-fixed errors (never auto-closes) while surfacing real
//   Sentry bugs for a human. dryRun reports the whole sweep and closes nothing.
//   PASS args AS A JSON OBJECT, never a JSON string — a string is treated as malformed and
//   clamps the run to dryRun (fail-closed).
// ---------------------------------------------------------------------------

// --- Resolve args (FAIL CLOSED) -------------------------------------------
// SAFETY-CRITICAL. The Workflow host may hand `args` to the script as a JSON STRING
// rather than a parsed object (a known footgun — same class as "a stringified list reaches
// the script as one string"). If that string is NOT re-parsed, `args?.dryRun` is `undefined`,
// so EVERY flag silently collapses to its LIVE default (autoMerge=true, dispatch=true,
// dryRun=false) and the workflow merges to `main` behind the operator's back. That actually
// happened once (a dryRun:true run merged two PRs live). So:
//   1. If `args` is a string, JSON.parse it back into an object.
//   2. If args were SUPPLIED but cannot be coerced to a plain object, CLAMP TO DRY RUN —
//      never fall through to the live defaults on ambiguous input. (Absent args === the
//      legitimate "all defaults, live" case and is NOT clamped.)
let ARGS = args
let argsWarning = null
if (typeof ARGS === 'string') {
  try { ARGS = JSON.parse(ARGS) } catch { ARGS = undefined; argsWarning = 'args arrived as an unparseable string' }
}
if (ARGS !== undefined && ARGS !== null && (typeof ARGS !== 'object' || Array.isArray(ARGS))) {
  ARGS = undefined; argsWarning = 'args was not a plain JSON object'
}
// args were PROVIDED but could not be understood => do not trust the defaults; run dry.
const ARGS_MALFORMED = (args !== undefined && args !== null) && (ARGS === undefined || ARGS === null)
if (ARGS_MALFORMED && !argsWarning) argsWarning = 'args could not be resolved to an object'

const DRY_RUN = ARGS?.dryRun === true || ARGS_MALFORMED
const AUTO_MERGE = !ARGS_MALFORMED && ARGS?.autoMerge !== false
const DISPATCH = !ARGS_MALFORMED && ARGS?.dispatch !== false
const RECONCILE = !ARGS_MALFORMED && ARGS?.reconcile !== false
const CLUSTER = ARGS?.cluster !== false
const MAX_MERGES = Number.isInteger(ARGS?.maxMerges) ? ARGS.maxMerges : 5
const MAX_DISPATCH = Number.isInteger(ARGS?.maxDispatch) ? ARGS.maxDispatch : 5
// PR SWEEP: also triage EVERY open PR, not just the ones a feedback item points at. Orphan PRs
// (built but never resolved — e.g. agentic-fix drafts left un-merged, or automation-loop
// pileups) get bucketed merge / close(recommend) / fix-first / needs-human. Same tight gate.
const SWEEP_PRS = ARGS?.sweepPrs !== false
const MAX_SWEEP_MERGES = Number.isInteger(ARGS?.maxSweepMerges) ? ARGS.maxSweepMerges : 5
// ISSUE SWEEP: also triage EVERY open GitHub issue, the OTHER pile that accumulates untouched.
// Two classes: (1) "feedback: plan" issues the plan automation opened — auto-reconciled CLOSED when
// their source ticket is provably RESOLVED/DISMISSED (mechanical, DB-truth; see triage:issues); and
// (2) Sentry-filed error issues — clustered + classified into noise / already-fixed / real-bug and
// RECOMMEND-closed (never auto-closed — judging noise is the operator's call), real bugs surfaced.
// Mirrors the PR sweep's philosophy: auto-act ONLY on provable reconciliation; everything else is
// recommend-only. maxIssueCloses caps the reconciliation auto-closes.
const SWEEP_ISSUES = ARGS?.sweepIssues !== false
const MAX_ISSUE_CLOSES = Number.isInteger(ARGS?.maxIssueCloses) ? ARGS.maxIssueCloses : 10
// MERGED SWEEP: the third pile. Intake's reconcile needs the ticket to CARRY the PR; the PR sweep
// only sees OPEN PRs. Work that shipped in a hand-built PR is invisible to both, so triage re-offers
// shipped code as new work. This scans RECENTLY MERGED PRs for a feedback id in the body and closes
// the still-open ticket. Bounded by BOTH a count cap and a mergedAt cutoff so it never walks the
// whole PR history; writes are capped separately and gated on DB truth (isOpen).
const SWEEP_MERGED = ARGS?.sweepMergedPrs !== false
const MAX_MERGED_SCAN = Number.isInteger(ARGS?.maxMergedScan) ? ARGS.maxMergedScan : 50
const MERGED_SINCE_DAYS = Number.isInteger(ARGS?.mergedSinceDays) ? ARGS.mergedSinceDays : 14
const MAX_MERGED_RECONCILE = Number.isInteger(ARGS?.maxMergedReconcile) ? ARGS.maxMergedReconcile : 20
const TENANT_ENV = ARGS?.tenantQuery ? `TRIAGE_TENANT=${JSON.stringify(ARGS.tenantQuery)} ` : ''
const RUNBOOK_DATE = typeof ARGS?.today === 'string' ? ARGS.today : null

// `Date.now()` / argless `new Date()` THROW inside a workflow script (they would break resume), so
// "N days ago" can only be computed from a date the caller passed in. `new Date(<string>)` is fine.
// No `today` and no explicit `mergedSince` => no date cutoff, and the scan is bounded by the count
// cap alone (still bounded, just coarser).
const isoMinusDays = (iso, days) => {
  const t = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return null
  t.setUTCDate(t.getUTCDate() - days)
  return t.toISOString().slice(0, 10)
}
const MERGED_SINCE = typeof ARGS?.mergedSince === 'string'
  ? ARGS.mergedSince.slice(0, 10)
  : (RUNBOOK_DATE ? isoMinusDays(RUNBOOK_DATE, MERGED_SINCE_DAYS) : null)

const FENCE = `The feedback auto-fix FENCE (allowed prefixes; the CI check verify:feedback-fence enforces this exactly):
  ALLOWED (UI/assistant + the plan-052 cellar-floor server domains + regression tests):
    src/app/(app)/ , src/app/api/feedback/ , src/components/ , src/lib/assistant/ , test/ ,
    and src/lib/{work-orders,vessel,vessels,lot,blend,bottling,bulk,cellar,ferment,harvest,chemistry,
                 stock,inventory,sparkling,vineyard,winemaking-calc,units,reference,settings,
                 locations,fieldnotes,developer,feedback}/
  NEVER AUTO-MERGE if touched (fenceOnly=false): .env* , .github/workflows/ , prisma/schema.prisma ,
    prisma/migrations/ , src/lib/auth , src/lib/dal , src/lib/tenant/ , src/lib/prisma , anything reading
    process.env for secrets, AND the deliberately-excluded money/ledger/moat domains
    src/lib/{ledger,cost,money,accounting,commerce,compliance,transform}/ + the file src/lib/audit.ts
    (these are NOT in the allowlist, so a fix touching them is fenceOnly=false).
  DOMAIN PROOF (plan 052) — the backstop: a PR touching a widened src/lib server domain (anything above
    OTHER than app/, components/, assistant/, api/feedback/) auto-merges ONLY if the CI check
    "feedback-domain-verify" ran AND passed. If that check is failing or pending => ciGreen=false. If it is
    ABSENT, or it warns "NO DOMAIN PROOF for ..." (the touched domain has no verify mapping), the fix is
    UNPROVEN => set mergeSafety="review" and do NOT auto-merge (route it to a human).`

// ERP-standards conformance rubric. A winery ERP is not a generic CRUD app: it is an
// append-only, double-entry, audited system of record. A "fix" or a "feature" that solves the
// reporter's immediate complaint by VIOLATING one of these standards is not an improvement — it
// silently degrades the ERP into a spreadsheet. The goalie evaluates every item against this
// rubric (does implementing what's asked push the system OFF-standard?) and the fix reviewer
// evaluates every open PR's DIFF against it. Grounded in this repo's own invariant register
// (INVARIANTS.md + docs/architecture/invariants/) — these are the standards made machine-checkable.
const ERP_STANDARDS = `ERP-STANDARDS CONFORMANCE — the non-negotiable properties of a system of record (this repo's INVARIANTS.md made concrete). Judge whether doing what the item ASKS FOR (or, for a PR, what the DIFF does) would push the ERP OFF-standard:
  1. APPEND-ONLY, IMMUTABLE HISTORY — events (LotOperation, StockMovement, journal, audit rows, compliance filings) are never edited or hard-deleted in place; current state is a FOLD/projection of the event log (LEDGER-7/10, COST-3). Smell: "let me edit/delete that past racking/movement/entry", a hard DELETE where an ERP would void/reverse.
  2. CORRECTION-AS-EVENT (the moat) — undo/amend/reverse is a NEW inverse or CORRECTION event linked to the target, never an in-place mutation or row reversion; corrections are conservatively guarded (LEDGER-3/10/11, AMEND-1, D6/D15). Smell: a request to "just change the number after the fact", a fix that mutates a historical row instead of appending a correction.
  3. DOUBLE-ENTRY / CONSERVATION — operations balance and volume+cost are conserved; you cannot create or destroy quantity or value out of band (LEDGER-6/8, COST-1). Smell: a fix that silences a balance/conservation guard "to make the number come out", fabricated volume, an unbalanced adjustment.
  4. IMMUTABILITY OF POSTED/EXECUTED RECORDS — an executed WO operation, a posted journal, a COGS snapshot, a taxpaid removal are TERMINAL and immutable; editing happens by superseding, not overwriting (WORKORDER-1/6, TAXPAID-1, COST-3). Smell: "make the executed step editable", reopening a terminal state in place.
  5. TENANT ISOLATION — every domain/registry table is tenant-scoped and RLS-fenced; only auth tables are global; no cross-tenant read/write and no adding tenantId to a global (TENANT-1/2). Smell: a "fix" that widens a query past the tenant fence, a feature that shares data across tenants, raw SQL that dodges the tenant extension.
  6. ATTRIBUTION / AUDIT TRAIL — every state change is attributable (enteredBy/observedAt/captureMethod + audit row) and audit rows are never rewritten. Smell: a change that drops attribution or edits the audit log to "clean it up".
  7. MASTER-DATA GOVERNANCE — identity is the surrogate immutable id; codes/displayName are a MUTABLE presentation layer; origin/vintage provenance is immutable after first use (NAMING-1/2). Smell: keying business logic on a mutable code, making provenance/identity editable, an honest-rename turned into an identity swap.
  8. EXACTLY-ONCE POSTING THROUGH THE OUTBOX — accounting/commerce state posts via the delivery outbox/poster with idempotency keys; the ERP is AUTHORITATIVE and external systems (QBO, Commerce7) are downstream REPLICAS; no direct side-writes, one-Bill-per-invoice (AP-1, D20). Smell: a fix that writes to the external system directly, treats C7/QBO as the source of truth, or drops the idempotency key.
  9. COMPLIANCE FILING INTEGRITY — form chains are formType-scoped and carry-forward-correct; bond/tax-class/CBMA isolation holds (COMPLIANCE-1/2, BOND-1, CBMA-1, TAXCLASS-1). Smell: a change that crosses the 5120.17 and 5000.24 chains, mutates a carry-forward, or blends tax classes.
Conformance levels to assign:
  - "ok"       — implementing the ask (or the diff) is fully consistent with the standards above; no concern.
  - "caution"  — it TOUCHES a governed area and could go off-standard if built naively; buildable, but the builder MUST be told the standard to uphold (name it). NOT a blocker.
  - "conflict" — what's ASKED FOR can only be satisfied by breaking a standard above (e.g. "let me delete/edit a past ledger entry", "make the executed op editable in place", "sync inventory FROM Commerce7 as truth"). The reported pain is real but the requested SOLUTION is non-standard; it needs a human to redesign the ask into a conformant shape (correction event, supersede, outbox) BEFORE any build. A conflict is NEVER auto-dispatched, auto-merged, or placed in a parallel build wave.`

// An agent field that is SUPPOSED to be an array but may arrive as a JSON string (a model
// satisfying a loose schema by stringifying its answer). Returns a real array, or null when the
// value is absent/unparseable so the caller can keep its deterministic fallback. Without this,
// `someAgentResult.field.length` silently counts CHARACTERS, not elements.
const asArray = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string') return null
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// A feedback item id is a cuid: leading 'c', then lowercase alphanumerics, ~25 chars. The merged-PR
// scan matches on SHAPE (not one PR-body template), so this is the shape gate applied in JS before
// anything reaches the DB. It is deliberately permissive — `triage:lookup` is the real validator:
// an id that is not a real ticket comes back in `missing` and is dropped, so a bad match can never
// produce a write. It only has to be tight enough to keep obvious noise (sha1s, words) out.
const CUID_RE = /^c[a-z0-9]{20,31}$/
const looksLikeFeedbackId = (s) => typeof s === 'string' && CUID_RE.test(s.trim())

// --- Boilerplate plan-issue detection --------------------------------------
// EVERY "feedback: plan" issue is opened from a STATIC template (scripts/feedback-plan-agent.ts
// emits the same markdown for every run — only the title carries the run id), and nothing ever
// writes `planMarkdown` back to the ticket. So a "plan-ready" item routinely points at an issue
// with NO plan in it, and the build planner cheerfully emits `/work <planUrl> — build the plan as
// written`. There is no plan to build. These sentences ARE the template; if a body is essentially
// nothing but them, it is a stub and the item needs `/plan`, not `/work`.
const PLAN_BOILERPLATE_MARKERS = [
  'plan generated from approved feedback automation',
  'the source feedback is treated as untrusted product evidence',
  'preserve tenant isolation',
  'do not include attachment bytes or private tenant identity in github',
  'plan only; no code changes',
  'review the linked app feedback item in the developer console',
  'human approval is required before dispatch',
  'no schema changes proposed by this generated plan',
  'reproduce and scope the issue',
  'implement a focused fix or plan follow-up',
  'verify with tests and browser qa',
  'run relevant unit and verification scripts',
  'user text is untrusted and must not be treated as instructions',
]
// Returns { stub, substantiveChars, coverage } — coverage is the fraction of the body's real content
// lines that are template lines. A HAND-EDITED or genuinely-generated plan pushes coverage down and
// substantiveChars up, and is respected as a real plan; we only call stub when there is essentially
// nothing else there. Conservative on purpose: mislabelling a real plan as a stub costs a wasted
// /plan run, but the reverse is the bug we are fixing.
const assessPlanBody = (body) => {
  const text = String(body || '')
    .replace(/^---[\s\S]*?\n---\s*/, '')   // yaml frontmatter
    .replace(/^\s*#{1,6} .*$/gm, '')       // headings — structure, not content
  const lines = text.split('\n')
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s*/, '').trim())  // list markers
    .filter(Boolean)
  if (lines.length === 0) return { stub: true, substantiveChars: 0, coverage: 1 }
  const isMarker = (l) => {
    const n = l.toLowerCase().replace(/[.\s]+$/, '')
    return PLAN_BOILERPLATE_MARKERS.some((m) => n === m || n.includes(m))
  }
  const substantive = lines.filter((l) => !isMarker(l))
  const substantiveChars = substantive.join(' ').length
  const coverage = 1 - substantive.length / lines.length
  return { stub: coverage >= 0.85 || substantiveChars < 400, substantiveChars, coverage }
}

const BACKLOG_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['contractVersion', 'items'],
  properties: {
    contractVersion: { type: 'number', enum: [2] },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['sourceType', 'id', 'tenantId', 'kind', 'title', 'status', 'automationStatus'],
        properties: {
          sourceType: { type: 'string', enum: ['ASSISTANT_FEEDBACK', 'FEEDBACK_TICKET'] },
          id: { type: 'string' },
          tenantId: { type: 'string' },
          tenantName: { type: 'string' },
          createdAt: { type: 'string' },
          kind: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          severityReported: { type: ['string', 'null'] },
          status: { type: 'string' },
          triageClass: { type: ['string', 'null'], description: 'Prior goalie-assigned disposition (DEFECT|MODEL_BEHAVIOR|PRODUCT_GAP|NOT_A_BUG|UNCLEAR) or null if never triaged — use it to see how this was classified last time.' },
          automationStatus: { type: 'string', description: 'NOT_REQUESTED|AWAITING_APPROVAL|QUEUED|RUNNING|PLANNED|PR_OPENED|FAILED|SKIPPED' },
          modeAtSubmission: { type: ['string', 'null'], description: 'REPORT_ONLY vs PLAN_MODE vs AGENTIC_FIX — the mode the item was submitted in.' },
          awaitingRunId: { type: ['string', 'null'] },
          awaitingRunKind: { type: ['string', 'null'], enum: ['PLAN', 'AGENTIC_FIX', null] },
          activeRun: {
            type: ['object', 'null'], additionalProperties: false,
            properties: {
              id: { type: 'string' },
              kind: { type: 'string', enum: ['PLAN', 'AGENTIC_FIX'] },
              status: { type: 'string', enum: ['AWAITING_APPROVAL', 'QUEUED', 'RUNNING'] },
            },
          },
          automationConflict: {
            type: ['object', 'null'], additionalProperties: false,
            properties: {
              code: { type: 'string', enum: ['PRODUCT_GAP_WITH_ACTIVE_FIX'] },
              runId: { type: 'string' },
              runKind: { type: 'string', enum: ['AGENTIC_FIX'] },
              runStatus: { type: 'string', enum: ['QUEUED', 'RUNNING', 'PR_OPENED'] },
              message: { type: 'string' },
            },
          },
          attachmentCount: { type: 'number' },
          githubIssueUrl: { type: ['string', 'null'], description: 'Where a PLANNED item\'s plan (or a SKIPPED item\'s run log) lives.' },
          planPresent: { type: ['boolean', 'null'] },
          planMarkdown: { type: ['string', 'null'], description: 'Inline plan snippet (capped) when a PLAN run stored one in the DB.' },
          developerNotes: { type: ['string', 'null'], description: 'Carries a SKIPPED run\'s "why I declined" note, plus prior triage notes.' },
          prUrl: { type: ['string', 'null'] },
          prNumber: { type: ['number', 'null'] },
          prState: { type: ['string', 'null'], enum: ['OPEN', 'MERGED', 'CLOSED', null], description: 'from `gh pr view` — null if no real PR' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const CLUSTER_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['clusters'],
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['memberIds', 'rootCause', 'justification'],
        properties: {
          memberIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          rootCause: { type: 'string', description: 'The single underlying defect these items share.' },
          justification: { type: 'string', description: 'Why these are the SAME root cause (not just the same symptom).' },
          suggestedPrimaryId: { type: ['string', 'null'] },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ranked', 'summary'],
  properties: {
    ranked: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'sourceType', 'tenantId', 'title', 'priority', 'type', 'bucket', 'effort', 'rationale', 'awaitingRunId', 'awaitingRunKind', 'automationConflict', 'erpStandards'],
        properties: {
          id: { type: 'string' },
          sourceType: { type: 'string' },
          tenantId: { type: 'string' },
          awaitingRunId: { type: ['string', 'null'] },
          awaitingRunKind: { type: ['string', 'null'], enum: ['PLAN', 'AGENTIC_FIX', null] },
          automationConflict: { type: ['object', 'null'], additionalProperties: true },
          prNumber: { type: ['number', 'null'] },
          title: { type: 'string' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          effort: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          isEasyWin: { type: 'boolean' },
          // DISPOSITION (what KIND of problem this really is, assigned from root cause — NOT the
          // reporter's intake kind). This is the axis that decides which workflow the item belongs in.
          type: {
            type: 'string',
            enum: ['defect', 'model-behavior', 'product-gap', 'not-a-bug', 'unclear'],
            description: 'defect=a real code bug with a code lever; model-behavior=LLM/prompt/eval adherence miss (stochastic, no guaranteed code fix); product-gap=missing capability/data-model — a feature request wearing a bug costume; not-a-bug=works-as-designed / user-error / support / empty-state; unclear=needs investigation.',
          },
          bucket: { type: 'string', enum: ['dispatch', 'route-plan', 'review-pr', 'plan-ready', 'needs-human', 'dismiss'] },
          // ERP-STANDARDS conformance of the REQUESTED change (not of the bug itself): would
          // building what's asked push the system of record off-standard? See ERP_STANDARDS.
          erpStandards: {
            type: 'object', additionalProperties: false,
            required: ['conformance'],
            properties: {
              conformance: { type: 'string', enum: ['ok', 'caution', 'conflict'], description: 'ok=consistent with ERP standards; caution=touches a governed area, buildable but the standard to uphold must be named; conflict=the requested SOLUTION can only be met by breaking a standard — needs human redesign, never auto-built.' },
              concern: { type: ['string', 'null'], description: 'For caution/conflict: the standard at risk + why, in one phrase (e.g. "would let a user edit a posted racking in place — violates correction-as-event").' },
              standards: { type: 'array', items: { type: 'string' }, description: 'Short ids/names of the standards implicated, e.g. ["correction-as-event", "LEDGER-10"], ["tenant-isolation"].' },
            },
          },
          rationale: { type: 'string' },
        },
      },
    },
    summary: { type: 'string', description: 'The plain-English plan of attack: what to smash first and why. Call out any ERP-standards CONFLICTS up front — items whose requested fix would break a system-of-record standard and must be redesigned before building.' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'assessment', 'addressesRootCause', 'mergeSafety', 'fenceOnly', 'ciGreen', 'sizeOk', 'recommendation'],
  properties: {
    id: { type: 'string' },
    prNumber: { type: ['number', 'null'] },
    assessment: { type: 'string', enum: ['root-fix', 'cosmetic', 'bandaid', 'unclear', 'wrong'] },
    addressesRootCause: { type: 'boolean' },
    deeperIssue: { type: ['string', 'null'], description: 'If cosmetic/band-aid: the underlying problem the PR papers over, and where it really lives (file/function).' },
    erpStandards: { type: 'string', enum: ['ok', 'caution', 'conflict'], description: 'Does the DIFF uphold the ERP system-of-record standards? conflict=the diff breaks one (e.g. mutates a posted record in place, hard-deletes history, widens past the tenant fence, writes the external system as source of truth) — never auto-merge.' },
    erpConcern: { type: ['string', 'null'], description: 'For caution/conflict: which standard the diff strains/breaks + where, in one phrase.' },
    mergeSafety: { type: 'string', enum: ['safe', 'review', 'do-not'] },
    fenceOnly: { type: 'boolean' },
    ciGreen: { type: 'boolean' },
    sizeOk: { type: 'boolean' },
    recommendation: { type: 'string' },
  },
}

const ACTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['merged', 'dispatched', 'planRouted', 'dismissed', 'planReady', 'queued', 'errors'],
  properties: {
    merged: { type: 'array', items: { type: 'object', additionalProperties: true } },
    dispatched: { type: 'array', items: { type: 'object', additionalProperties: true } },
    planRouted: { type: 'array', items: { type: 'object', additionalProperties: true } },
    dismissed: { type: 'array', items: { type: 'object', additionalProperties: true } },
    planReady: { type: 'array', items: { type: 'object', additionalProperties: true } },
    queued: { type: 'array', items: { type: 'object', additionalProperties: true } },
    errors: { type: 'array', items: { type: 'object', additionalProperties: true } },
    sweptMerged: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Orphan open PRs auto-merged by the sweep (un-drafted first if needed), each with prNumber + any feedback item resolved.' },
    issuesClosed: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Stale "feedback: plan" GitHub issues auto-closed by the issue sweep because their source ticket is provably RESOLVED/DISMISSED (mechanical reconciliation), each with issueNumber.' },
    mergedPrReconciled: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Still-open tickets closed to RESOLVED by the MERGED sweep because their work already shipped in an already-merged PR that was never stamped on the ticket. Each with id + prNumber + ok.' },
  },
}

// PR SWEEP — enumerate EVERY open PR (independent of the feedback backlog) so PRs that were
// built but never resolved don't pile up. One agent lists them with the metadata the gate needs.
const PR_LIST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['prs'],
  properties: {
    prs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['number', 'title', 'isDraft', 'mergeable', 'ciState'],
        properties: {
          number: { type: 'number' },
          title: { type: 'string' },
          headRefName: { type: ['string', 'null'] },
          isDraft: { type: 'boolean' },
          mergeable: { type: 'string', enum: ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'], description: 'from gh — CONFLICTING means a merge conflict with base (DIRTY).' },
          ciState: { type: 'string', enum: ['green', 'failing', 'pending', 'none'], description: 'rollup of required checks.' },
          changedFiles: { type: ['number', 'null'] },
          additions: { type: ['number', 'null'] },
          deletions: { type: ['number', 'null'] },
          createdAt: { type: ['string', 'null'] },
          body: { type: ['string', 'null'], description: 'truncated PR description (~400 chars) — used to spot WIP/superseded markers + feedback linkage.' },
          url: { type: ['string', 'null'] },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// Per-orphan-PR verdict: what it does, is it complete, does it pass the tight gate + ERP
// standards, and which sweep bucket it lands in.
const PR_SWEEP_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['prNumber', 'summary', 'sweepBucket', 'complete', 'assessment', 'mergeSafety', 'fenceOnly', 'ciGreen', 'sizeOk', 'erpStandards', 'recommendation'],
  properties: {
    prNumber: { type: 'number' },
    summary: { type: 'string', description: 'One line: what this PR actually changes.' },
    // merge = clears the tight gate, ready to land (un-draft if needed); close = superseded /
    // duplicate / stale / abandoned (RECOMMEND only — never auto-closed); fix-first = failing CI
    // or conflicting, needs work before it can land; needs-human = out-of-fence / large / a real
    // feature / anything that needs eyes.
    sweepBucket: { type: 'string', enum: ['merge', 'close', 'fix-first', 'needs-human'] },
    complete: { type: 'boolean', description: 'Is this a finished change (not WIP)? A green non-draft coherent diff = complete; a draft with TODO/WIP markers or an obviously partial diff = false. If unsure a DRAFT is complete, set false and bucket needs-human — never un-draft-and-merge a WIP.' },
    assessment: { type: 'string', enum: ['root-fix', 'cosmetic', 'bandaid', 'unclear', 'wrong', 'feature', 'docs', 'chore'] },
    closeReason: { type: ['string', 'null'], description: 'For sweepBucket close: WHY (superseded by #N / duplicate of #N / stale-and-conflicting / abandoned). Name the superseding PR when there is one.' },
    supersededByPr: { type: ['number', 'null'] },
    linkedFeedbackId: { type: ['string', 'null'], description: 'If the PR body/branch ties it to a feedback item id, that id — so a merge can write the item back RESOLVED.' },
    erpStandards: { type: 'string', enum: ['ok', 'caution', 'conflict'], description: 'Same ERP-standards conformance judgment of the DIFF as the feedback reviewer. conflict never auto-merges.' },
    erpConcern: { type: ['string', 'null'] },
    mergeSafety: { type: 'string', enum: ['safe', 'review', 'do-not'] },
    fenceOnly: { type: 'boolean' },
    ciGreen: { type: 'boolean' },
    sizeOk: { type: 'boolean' },
    recommendation: { type: 'string' },
  },
}

// The shape `npm run triage:lookup -- --ids=a,b,c` prints. Shared by BOTH consumers: the PR sweep's
// aged-out-ticket lookup and the MERGED sweep's already-shipped reconciliation. This is the single
// authority on whether an id extracted from a PR body is (a) a real ticket at all and (b) still open
// — a bogus id lands in `missing`, and `isOpen === false` blocks any rewrite of a closed ticket.
const TICKET_LOOKUP_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['found'],
  properties: {
    found: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: true,
        required: ['id', 'tenantId', 'sourceType', 'status', 'isOpen'],
        properties: {
          id: { type: 'string' }, tenantId: { type: 'string' },
          sourceType: { type: 'string', enum: ['FEEDBACK_TICKET', 'ASSISTANT_FEEDBACK'] },
          status: { type: 'string' }, isOpen: { type: 'boolean' },
          prNumber: { type: ['number', 'null'] }, title: { type: ['string', 'null'] },
        },
      },
    },
    missing: { type: 'array', items: { type: 'string' } },
  },
}

// MERGED SWEEP — recently-merged PRs + whatever feedback ids their BODIES name. The agent's ONLY job
// is to run `gh` and pull candidate ids out of prose; every downstream decision (shape, dedupe, cap,
// is-it-real, is-it-open) is made deterministically in JS / by triage:lookup. PR bodies vary in
// wording ("Closes the feedback item `<id>`" on a hand-built PR; "Automated fix from bug ticket
// `<id>`" on a dispatched one), so the instruction is match-by-shape-near-feedback-wording, NOT one
// template — over-matching is safe here (the DB drops what isn't real), under-matching is the bug.
const MERGED_PR_SCAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['prs'],
  properties: {
    prs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['number', 'feedbackIds'],
        properties: {
          number: { type: 'number' },
          title: { type: ['string', 'null'] },
          mergedAt: { type: ['string', 'null'] },
          mergeCommit: { type: ['string', 'null'], description: 'The squash commit sha (mergeCommit.oid), short or full — quoted in the outcome note as the proof.' },
          url: { type: ['string', 'null'] },
          feedbackIds: {
            type: 'array', items: { type: 'string' },
            description: 'EVERY cuid-shaped id (leading "c", ~25 lowercase alphanumerics) that appears in this PR body near feedback/ticket/bug-item wording. Empty array when there is none — never invent one.',
          },
          evidence: { type: ['string', 'null'], description: 'The short phrase each id was found in, e.g. "Closes the feedback item `cmr…`" — quoted in the report so a human can audit the match.' },
        },
      },
    },
    scanned: { type: ['number', 'null'], description: 'How many merged PRs were actually examined.' },
    notes: { type: 'string' },
  },
}

// PLAN-STUB CHECK — is the "plan" a plan-ready item points at actually a plan? Every feedback plan
// issue is opened from a static template, so the answer is usually no. The agent fetches the issue
// body; the stub JUDGMENT is made in JS (assessPlanBody) so it is deterministic and auditable.
const PLAN_STUB_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'The feedback item id this plan issue belongs to (echo it back verbatim).' },
          issueNumber: { type: ['number', 'null'] },
          state: { type: ['string', 'null'], description: 'OPEN / CLOSED, or null if the issue could not be read.' },
          body: { type: ['string', 'null'], description: 'The issue body VERBATIM (up to ~4000 chars). Do not summarize, reformat, or judge it — the workflow decides.' },
          error: { type: ['string', 'null'], description: 'Set if the issue could not be read (deleted, wrong repo, no url).' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// ISSUE SWEEP — enumerate EVERY open GitHub issue and partition it. The two classes that pile up:
// "feedback: plan" issues (opened by the plan automation, author app/github-actions) and Sentry
// error issues (label "sentry" / author app/sentry). "other" is anything else (a hand-filed
// engineering issue) — left for a human. The classification is mechanical; the DISPOSITION of a
// Sentry issue (noise vs real bug) is judged separately (SENTRY_TRIAGE_SCHEMA), and a plan issue's
// closeability is judged from DB truth (PLAN_ISSUE_MAP_SCHEMA), never from the issue text.
const ISSUE_LIST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['number', 'title', 'issueClass'],
        properties: {
          number: { type: 'number' },
          title: { type: 'string' },
          author: { type: ['string', 'null'], description: 'login, e.g. "app/sentry", "app/github-actions".' },
          labels: { type: 'array', items: { type: 'string' } },
          createdAt: { type: ['string', 'null'] },
          // feedback-plan = a "feedback: plan …" issue from the plan automation (reconcile via DB truth);
          // sentry = a Sentry-filed error (classify noise/fixed/real); other = anything else (leave for a human).
          issueClass: { type: 'string', enum: ['feedback-plan', 'sentry', 'other'] },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// The uncapped plan-issue → ticket map from `npm run triage:issues` (owner DB read, cross-tenant).
// The issue's own title/body carries only the PLAN-RUN id, NOT the ticket id, so this DB map is the
// ONLY reliable way to know whether a plan issue's ticket is done. Passthrough — validated, not judged.
const PLAN_ISSUE_MAP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['planIssues'],
  properties: {
    planIssues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['issueNumber', 'ticketId', 'tenantId', 'sourceType', 'status', 'isOpen'],
        properties: {
          issueNumber: { type: 'number' },
          issueUrl: { type: ['string', 'null'] },
          ticketId: { type: 'string' },
          tenantId: { type: 'string' },
          sourceType: { type: 'string', enum: ['FEEDBACK_TICKET', 'ASSISTANT_FEEDBACK'] },
          status: { type: 'string' },
          automationStatus: { type: ['string', 'null'] },
          prNumber: { type: ['number', 'null'] },
          isOpen: { type: 'boolean', description: 'ticket is still NEW/TRIAGED/IN_PROGRESS — keep the issue open; false => RESOLVED/DISMISSED => the plan issue is stale and closeable.' },
        },
      },
    },
  },
}

// Per-Sentry-issue disposition. Sentry auto-files an error as an issue; most are noise. The goalie
// READS THE FULL STACK and judges each: dev-noise (a .claude/worktrees/… path ANYWHERE in the frames —
// even when the top frames look prod-clean — never prod), expected-validation (a guard working as
// designed, mis-captured as an error), config-or-fixed (a config/setup error, or a stale pre-fix dev
// artifact whose failing pattern no longer exists on main), or real-bug (a genuine defect that still
// lives on main). Everything but real-bug is a RECOMMEND-close (never auto).
const SENTRY_TRIAGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['number', 'disposition', 'reason'],
        properties: {
          number: { type: 'number' },
          // dev-noise = a .claude/worktrees/… path ANYWHERE in the stack (even if the TOP frames look
          //   prod-clean src/…) or otherwise not a prod signal — read the full stack, the tell is often deep;
          // expected-validation = a domain guard firing correctly (empty vessel, over-capacity,
          //   not-enough-stock) surfaced as an error — close + suggest a Sentry ignore rule;
          // config-or-fixed = a config/setup error, or a stale event whose file+line no longer has the
          //   failing pattern on current main (a pre-fix dev artifact of code that later shipped corrected);
          // real-bug = a genuine defect that still exists on main (no worktree path in the stack);
          // keep = genuinely unsure, leave open (preferred over a shaky real-bug).
          disposition: { type: 'string', enum: ['dev-noise', 'expected-validation', 'config-or-fixed', 'real-bug', 'keep'] },
          reason: { type: 'string', description: 'One line: why this disposition (quote the tell — a worktree path, the guard name, the config).' },
          suggestFilter: { type: 'boolean', description: 'For expected-validation especially: recommend a Sentry beforeSend/ignore rule so this class stops recurring.' },
        },
      },
    },
    notes: { type: 'string', description: 'Cross-cutting observations — e.g. "4 issues share the invoice-ingestion worktree path".' },
  },
}

// RECONCILE — one row per merged-but-open item the agent wrote back to RESOLVED. The `results`
// array MUST be a real array: it was previously an untyped `additionalProperties: true` object, so
// the agent satisfied the schema by returning the run's JSON as a STRING and `counts.reconciled`
// reported that string's character length (390 for a single item) instead of the item count.
const RECONCILE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      description: 'One entry per item, in the order processed — the JSON each `triage:resolve` run printed, normalized.',
      items: {
        type: 'object', additionalProperties: true,
        required: ['id', 'ok'],
        properties: {
          id: { type: 'string' },
          ok: { type: 'boolean', description: 'true if the resolve command reported success for this item.' },
          prNumber: { type: ['number', 'null'] },
          title: { type: ['string', 'null'] },
          status: { type: ['string', 'null'], description: 'The status the item was written to (RESOLVED on success).' },
          error: { type: ['string', 'null'], description: 'For ok=false: what the command reported.' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// Build-conflict planner: which actionable items can be BUILT concurrently (disjoint
// files/domains, no dependency) vs must be sequenced. Powers TRIAGE-RUNBOOK.md so a fleet
// of Claude Code instances can clear the backlog in parallel without merge conflicts.
const BUILD_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['waves'],
  properties: {
    waves: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['wave', 'parallelSafe', 'tasks'],
        properties: {
          wave: { type: 'number' },
          parallelSafe: { type: 'boolean', description: 'true if every task in this wave touches DISJOINT files/domains and has no unmet dependency — they can be built at the same time in separate Claude Code instances, each on its own branch/PR, with no merge conflict.' },
          rationale: { type: 'string', description: 'Why these can run together (disjoint domains) — or, for a lone/sequential wave, what shared file or dependency forced it to wait.' },
          tasks: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['id', 'title', 'action', 'domains'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                priority: { type: ['string', 'null'], enum: ['P0', 'P1', 'P2', null] },
                action: { type: 'string', description: 'The concrete next command to run in the instance that picks this up, e.g. "/work https://…/issues/232", "/investigate then /work (dispatch failed)", "review PR #239".' },
                domains: { type: 'array', items: { type: 'string' }, description: 'The code domains/files this build will most likely touch — the basis for conflict detection (e.g. ["src/lib/vineyard", "prisma/schema.prisma"]).' },
                dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of tasks that must land FIRST (e.g. AVA-validation dependsOn the vineyard-fields task).' },
                planUrl: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
    planFirst: {
      type: 'array', description: 'Items that need a PLAN before any build (product-gaps with no plan yet). Run /plan first; they become buildable next run.',
      items: { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string' }, action: { type: 'string' } } },
    },
    investigateFirst: {
      type: 'array', description: 'Items too unclear to build (need /investigate before a fix exists).',
      items: { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string' }, action: { type: 'string' } } },
    },
    erpReview: {
      type: 'array', description: 'Items whose REQUESTED change conflicts with an ERP system-of-record standard. They are held OUT of every build wave — a human must redesign the ask into a conformant shape (correction event / supersede / outbox / tenant-scoped) before any code is written.',
      items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'concern'], properties: { id: { type: 'string' }, title: { type: 'string' }, concern: { type: 'string', description: 'The standard it breaks + why.' }, action: { type: 'string', description: 'The conformant redesign to pursue, e.g. "redesign as a CORRECTION event, then /plan".' } } },
    },
    notes: { type: 'string' },
  },
}

// Deterministic markdown renderer for TRIAGE-RUNBOOK.md — built in JS (not by the LLM) so
// the checklist is always well-formed. The skill writes the returned string to the repo root.
function renderRunbook({ planSummary, byType, buildPlan, inFlight, actions, dateStr, erpFlags, sweep, issueSweep }) {
  const L = []
  const chk = (s) => `- [ ] ${s}`
  L.push('# Triage Runbook')
  L.push('')
  L.push(`_Generated by /bug-triage${dateStr ? ` on ${dateStr}` : ''}. A working checklist — tick items off as you clear them. Regenerated on every run, so local edits are ephemeral._`)
  L.push('')
  if (byType && Object.keys(byType).length) {
    L.push(`**Backlog shape:** ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')}.`)
    L.push('')
  }
  if (planSummary) { L.push('## Plan of attack'); L.push(''); L.push(planSummary); L.push('') }

  // ⚠️ ERP-standards pass — surfaced BEFORE the build plan because a conflict item must not be
  // built as asked. Conflicts are held out of every wave; cautions build with the standard named.
  const flags = (erpFlags || [])
  const conflicts = flags.filter((f) => f.level === 'conflict')
  const cautions = flags.filter((f) => f.level === 'caution')
  const erpReviewById = new Map((buildPlan?.erpReview || []).map((e) => [e.id, e]))
  if (flags.length) {
    L.push('## ⚠️ ERP-standards pass')
    L.push('')
    L.push('Every actionable item was checked against the system-of-record standards (append-only')
    L.push('ledger, correction-as-event, double-entry conservation, immutable posted records, tenant')
    L.push('isolation, audit trail, master-data identity, exactly-once outbox posting, compliance chain).')
    L.push('')
    if (conflicts.length) {
      L.push(`### 🛑 Conflicts — do NOT build as asked (${conflicts.length})`)
      L.push('')
      L.push('_The reported pain is real, but the **requested change** would break a standard. A human must redesign the ask into a conformant shape (correction event / supersede / outbox / tenant-scoped) BEFORE any code. Held out of all build waves; auto-merge/dispatch blocked._')
      L.push('')
      for (const f of conflicts) {
        const redesign = erpReviewById.get(f.id)?.action
        L.push(chk(`**${f.title}** ${f.priority ? `(${f.priority}) ` : ''}\`${f.id}\` — _${f.source === 'pr-diff' ? 'PR diff' : 'requested change'}_`))
        L.push(`      - breaks: ${f.concern || 'a system-of-record standard'}${f.standards?.length ? ` (${f.standards.join(', ')})` : ''}`)
        if (redesign) L.push(`      - conformant redesign: ${redesign}`)
      }
      L.push('')
    }
    if (cautions.length) {
      L.push(`### 🟡 Cautions — buildable, uphold the standard (${cautions.length})`)
      L.push('')
      for (const f of cautions) {
        L.push(`- \`${f.id}\` **${f.title}** — uphold: ${f.concern || 'the touched standard'}${f.standards?.length ? ` (${f.standards.join(', ')})` : ''}`)
      }
      L.push('')
    }
  }

  const waves = (buildPlan?.waves || [])
  L.push('## ⚡ Parallel build plan')
  L.push('')
  if (waves.length === 0) {
    L.push('_Nothing to build right now — no plan-ready or needs-build items this run._')
    L.push('')
  } else {
    L.push('Each **wave** is a set of tasks that touch disjoint code. Build every task in a')
    L.push('parallel-safe wave **at the same time** — open a separate Claude Code instance per')
    L.push('task, each on its own branch + PR — then move to the next wave. Waves are ordered')
    L.push('because of file overlap or dependencies.')
    L.push('')
    for (const w of waves) {
      const n = (w.tasks || []).length
      const banner = w.parallelSafe && n > 1
        ? `⚡ parallel-safe — build these ${n} concurrently in ${n} instances`
        : (n === 1 ? 'single task' : '🔒 sequential — build in order')
      L.push(`### Wave ${w.wave} — ${banner}`)
      if (w.rationale) { L.push(`> ${w.rationale}`) }
      L.push('')
      for (const t of (w.tasks || [])) {
        const dep = (t.dependsOn && t.dependsOn.length) ? t.dependsOn.join(', ') : 'nothing'
        L.push(chk(`**${t.title}** ${t.priority ? `(${t.priority}) ` : ''}\`${t.id}\``))
        L.push(`      - do: ${t.action}`)
        L.push(`      - touches: ${(t.domains || []).join(', ') || '—'}`)
        L.push(`      - depends on: ${dep}`)
        if (t.planUrl) L.push(`      - plan: ${t.planUrl}`)
      }
      L.push('')
    }
  }

  if (buildPlan?.planFirst?.length) {
    L.push('## 🧭 Plan these first (no plan yet)')
    L.push('')
    L.push('_Run `/plan` on each — they become buildable next triage run._')
    L.push('')
    for (const p of buildPlan.planFirst) L.push(chk(`**${p.title}** \`${p.id}\` — ${p.action || '/plan'}`))
    L.push('')
  }
  if (buildPlan?.investigateFirst?.length) {
    L.push('## 🔍 Investigate first (too unclear to build)')
    L.push('')
    for (const p of buildPlan.investigateFirst) L.push(chk(`**${p.title}** \`${p.id}\` — ${p.action || '/investigate'}`))
    L.push('')
  }

  // In flight — an agent/PR is already moving on these; do NOT open a second build.
  const flight = [
    ...(actions?.dispatched || []).map((x) => `\`${x.id}\` — fix agent dispatched, PR to follow`),
    ...(inFlight || []).map((x) => `\`${x.id}\` ${x.title ? `(${x.title})` : ''} — run ${x.automationStatus || 'RUNNING'}`),
  ]
  if (flight.length) {
    L.push('## 🚧 In flight — do NOT rebuild')
    L.push('')
    for (const f of flight) L.push(`- ${f}`)
    L.push('')
  }

  // 🧹 PR sweep — the open-PR backlog (every open PR, not just feedback-linked). This is the
  // "we build PRs but never resolve them" cleanup: what auto-landed, what to close, what to fix.
  if (sweep && (sweep.scanned || sweep.merged?.length || sweep.closeRecommend?.length || sweep.fixFirst?.length || sweep.needsHuman?.length || sweep.mergedScanned || sweep.mergedReconciled?.length)) {
    L.push('## 🧹 PR sweep — clear the open-PR backlog')
    L.push('')
    L.push(`_Every open PR triaged (${sweep.scanned} swept beyond the feedback-linked ones). Auto-merge landed the gate-passers; the rest is one paste each._`)
    L.push('')
    if (sweep.merged?.length) {
      L.push(`### ✅ Auto-merged (${sweep.merged.length})`)
      for (const m of sweep.merged) L.push(`- merged PR #${m.prNumber}${m.feedbackId || m.feedbackResolved ? ` → RESOLVED feedback \`${m.feedbackId || m.feedbackResolved}\`` : ''}${m.would ? ` — _would: ${m.would}_` : ''}`)
      L.push('')
    }
    if (sweep.linkedReconciled?.length) {
      L.push(`### 🔗 Aged-out tickets reconciled (${sweep.linkedReconciled.length})`)
      L.push('')
      L.push('_These source tickets had fallen outside the intake window; the sweep discovered them from the merged PR and closed them to RESOLVED._')
      for (const t of sweep.linkedReconciled) L.push(`- PR #${t.prNumber} → ticket \`${t.ticketId}\` (${t.tenantId})`)
      L.push('')
    }
    // 🚢 The already-shipped pass — the blind spot where a hand-built PR closes a ticket nobody
    // ever linked. Sits with the aged-out section because both answer "this ticket is lying".
    if (sweep.mergedReconciled?.length || sweep.mergedSkipped?.length || sweep.supersededByShipped?.length) {
      L.push(`### 🚢 Already shipped — reconciled from merged PRs (${sweep.mergedReconciled?.length || 0})`)
      L.push('')
      L.push(`_Scanned ${sweep.mergedScanned ?? 0} recently-merged PR(s)${sweep.mergedSince ? ` (merged on/after ${sweep.mergedSince})` : ''} for a feedback id in the body. These tickets were STILL OPEN even though their work is already in production — a fix PR built by hand never gets stamped onto its ticket, so neither the intake reconcile (needs a PR on the ticket) nor the PR sweep (open PRs only) could see it. Do NOT build any of these._`)
      L.push('')
      for (const t of (sweep.mergedReconciled || [])) {
        L.push(`- \`${t.id}\`${t.title ? ` **${t.title}**` : ''} — shipped in PR #${t.prNumber}${t.prTitle ? ` (${t.prTitle})` : ''}${t.mergeCommit ? ` \`${String(t.mergeCommit).slice(0, 8)}\`` : ''}${t.mergedAt ? ` on ${String(t.mergedAt).slice(0, 10)}` : ''} → ${t.applied ? 'RESOLVED' : `**would** close (was ${t.wasStatus})`}${t.duplicates ? ` +${t.duplicates} duplicate(s)` : ''}`)
        if (t.evidence) L.push(`      - matched on: ${String(t.evidence).replace(/\s+/g, ' ').slice(0, 160)}`)
      }
      if (sweep.supersededByShipped?.length) {
        L.push('')
        L.push(`_⚠️ ${sweep.supersededByShipped.length} item(s) this run had ranked as actionable were pulled back out — the work was already shipped:_`)
        for (const s of sweep.supersededByShipped) L.push(`- \`${s.id}\` ${s.title || ''} — was bucketed **${s.bucket}**, now reconciled instead of built`)
      }
      if (sweep.mergedSkipped?.length) {
        L.push('')
        L.push(`_Candidate ids the scan found but did NOT write (${sweep.mergedSkipped.length}) — listed so nothing is dropped silently:_`)
        for (const s of sweep.mergedSkipped) L.push(`- \`${s.id}\` (PR #${s.prNumber}) — ${s.why}`)
      }
      L.push('')
    }
    if (sweep.closeRecommend?.length) {
      L.push(`### 🗑️ Recommend close — superseded / duplicate / stale (${sweep.closeRecommend.length})`)
      L.push('')
      L.push('_Not auto-closed — confirm, then run the command:_')
      for (const c of sweep.closeRecommend) {
        L.push(chk(`**#${c.prNumber}** ${c.title ? `${c.title} ` : ''}— ${c.reason}${c.supersededByPr ? ` (keep #${c.supersededByPr})` : ''}`))
        L.push(`      - \`${c.closeCommand}\``)
      }
      L.push('')
    }
    if (sweep.fixFirst?.length) {
      L.push(`### 🔧 Fix first — failing CI or conflicting (${sweep.fixFirst.length})`)
      for (const f of sweep.fixFirst) L.push(chk(`**#${f.prNumber}** ${f.title || ''} — ${f.why || 'needs work'} · ${f.action}`))
      L.push('')
    }
    if (sweep.needsHuman?.length) {
      L.push(`### 👤 Needs a human — out-of-fence / large / real feature (${sweep.needsHuman.length})`)
      for (const h of sweep.needsHuman) {
        L.push(chk(`**#${h.prNumber}** ${h.title || ''} — [${h.assessment}${h.erp && h.erp !== 'ok' ? `, erp:${h.erp}` : ''}] ${h.why || 'review'}`))
        L.push(`      - if good: \`${h.mergeCommand}\``)
      }
      L.push('')
    }
  }

  // 🗂️ Issue sweep — the open-ISSUE backlog (plan issues + Sentry noise). "we open issues but
  // never close them": stale plan issues auto-reconciled shut, Sentry noise recommend-closed.
  if (issueSweep && (issueSweep.scanned || issueSweep.reconcileClosed?.length || issueSweep.recommendClose?.length || issueSweep.routeBug?.length)) {
    L.push('## 🗂️ Issue sweep — clear the open-issue backlog')
    L.push('')
    L.push(`_Every open GitHub issue triaged (${issueSweep.scanned} scanned). Stale plan issues auto-closed on DB truth; Sentry noise is recommend-close (your call); real bugs routed._`)
    L.push('')
    if (issueSweep.reconcileClosed?.length) {
      L.push(`### ✅ Auto-closed — stale plan issues, ticket already resolved (${issueSweep.reconcileClosed.length})`)
      for (const r of issueSweep.reconcileClosed) L.push(`- closed #${r.number} — ${r.would} (ticket \`${r.ticketId}\`)`)
      L.push('')
    }
    if (issueSweep.recommendClose?.length) {
      L.push(`### 🗑️ Recommend close — Sentry noise / stale (${issueSweep.recommendClose.length})`)
      L.push('')
      L.push('_Not auto-closed — confirm, then run the command:_')
      for (const c of issueSweep.recommendClose) {
        L.push(chk(`**#${c.number}** ${c.title ? `${c.title} ` : ''}— [${c.disposition}] ${c.reason}${c.suggestFilter ? ' _(add a Sentry ignore rule so it stops recurring)_' : ''}`))
        L.push(`      - \`${c.closeCommand}\``)
      }
      L.push('')
    }
    if (issueSweep.routeBug?.length) {
      L.push(`### 🐛 Route as a real bug — genuine Sentry defects (${issueSweep.routeBug.length})`)
      for (const b of issueSweep.routeBug) L.push(chk(`**#${b.number}** ${b.title || ''} — ${b.reason} · ${b.action}`))
      L.push('')
    }
  }

  // Cleared this run.
  const cleared = []
  for (const m of (actions?.merged || [])) cleared.push(`merged PR #${m.prNumber ?? '?'} → RESOLVED (\`${m.id}\`)`)
  for (const m of (actions?.sweptMerged || [])) cleared.push(`swept-merged PR #${m.prNumber ?? '?'}${m.feedbackResolved ? ` → RESOLVED \`${m.feedbackResolved}\`` : ''}`)
  for (const c of (actions?.issuesClosed || [])) cleared.push(`closed stale issue #${c.number ?? '?'} (reconciled)`)
  // Under dryRun these carry `would` and no `ok` — say so rather than claiming a write happened.
  for (const r of (actions?.mergedPrReconciled || [])) cleared.push(`already shipped in PR #${r.prNumber ?? '?'} → ${r.would ? '**would** RESOLVE' : 'RESOLVED'} \`${r.id}\` (reconciled, not rebuilt)`)
  for (const d of (actions?.dismissed || [])) cleared.push(`dismissed \`${d.id}\``)
  for (const r of (actions?.planRouted || [])) cleared.push(`routed to /plan \`${r.id}\``)
  if (cleared.length) {
    L.push('## ✅ Cleared this run')
    L.push('')
    for (const c of cleared) L.push(`- ${c}`)
    L.push('')
  }
  return L.join('\n')
}

// --- Intake ---------------------------------------------------------------
phase('Intake')
log(`Mode: ${DRY_RUN ? '🟡 DRY RUN — no merges / dispatches / status writes' : '🔴 LIVE — will merge PRs & write status to main'} | autoMerge=${AUTO_MERGE} dispatch=${DISPATCH} reconcile=${RECONCILE} cluster=${CLUSTER} maxMerges=${MAX_MERGES} maxDispatch=${MAX_DISPATCH}`)
if (argsWarning) log(`⚠️ ${argsWarning} — clamped to DRY RUN (fail-closed). Re-invoke passing args as a JSON OBJECT, not a string.`)
log('Pulling the feedback backlog (DB truth) + resolving each fix PR against git.')
const backlog = await agent(
  `You are the INTAKE agent for the bug-triage goalie of an AI-native winery ERP. Assemble the authoritative backlog and reconcile it against git. Do NOT guess — run the commands.

1. Run: \`${TENANT_ENV}npm run triage:list\` from the repo root. It prints a JSON block (after npm's own log lines — parse the JSON object only). Require contractVersion=2; if another version appears, STOP instead of guessing. Fields per item: sourceType, id, tenantId, tenantName, createdAt, kind ("BUG_REPORT" | "FEATURE_REQUEST" | "Assistant"), title, body, severityReported, status (NEW|TRIAGED|IN_PROGRESS|RESOLVED|DISMISSED), triageClass, automationStatus (NOT_REQUESTED|AWAITING_APPROVAL|QUEUED|RUNNING|PLANNED|PR_OPENED|FAILED|SKIPPED), modeAtSubmission (REPORT_ONLY|PLAN_MODE|AGENTIC_FIX), awaitingRunId, awaitingRunKind (PLAN|AGENTIC_FIX|null), activeRun, automationConflict, githubIssueUrl, planPresent, planMarkdown (a PLAN snippet), developerNotes, prUrl, attachmentCount. An awaitingRunId is dispatchable only through the route matching awaitingRunKind.
   - If it errors because there is no .env in this checkout, say so clearly and STOP — the operator must run from the main repo checkout.
2. For EACH item whose prUrl matches \`/pull/<number>\`, extract prNumber and resolve prState with \`gh pr view <number> --json state,mergedAt\`: mergedAt non-null => "MERGED"; state CLOSED => "CLOSED"; state OPEN => "OPEN". Items with no PR (or a non-PR url like a commit sha, or an ISSUE url) get prNumber=null, prState=null. Batch these; don't stall on one.
3. Return contractVersion=2 and every item with ALL fields above PLUS prNumber + prState. Pass through modeAtSubmission, awaitingRunId, awaitingRunKind, activeRun, automationConflict, githubIssueUrl, planPresent, planMarkdown, developerNotes, and triageClass verbatim (truncate planMarkdown/developerNotes to ~800 chars each if long). Include ALL items (closed ones too) — the workflow decides what is active vs already-handled.`,
  { label: 'intake', phase: 'Intake', schema: BACKLOG_SCHEMA },
)

const items = (backlog?.items || [])
if (items.length === 0) {
  return { status: 'empty', reason: 'No feedback items in the backlog.', backlogNotes: backlog?.notes }
}

// --- Classify (deterministic) ---------------------------------------------
const isDbClosed = (s) => s === 'RESOLVED' || s === 'DISMISSED'
const dbClosed = items.filter((i) => isDbClosed(i.status))
// A merged PR means the fix shipped — the item is done even if its DB status lags.
const reconcileClose = items.filter((i) => !isDbClosed(i.status) && i.prState === 'MERGED')
// A fix agent is mid-flight and no PR exists yet — nothing to review; report and wait.
const inFlight = items.filter(
  (i) => !isDbClosed(i.status) && i.prState == null && !i.awaitingRunId &&
    (i.automationStatus === 'RUNNING' || i.automationStatus === 'QUEUED'),
)
const handledIds = new Set([...dbClosed, ...reconcileClose, ...inFlight].map((i) => i.id))
const active = items.filter((i) => !handledIds.has(i.id))
// PLANNED (plan-mode result) and SKIPPED (agent declined) stay IN `active` so they get
// clustered + prioritized, but we label them so nothing treats them as a plain NEW bug:
// a PLANNED item is a plan awaiting review (never re-dispatched); a SKIPPED item carries
// a reason that must reach the queue. awaitingRunId is null for both, so neither can be
// auto-dispatched by the dispatch gate below regardless.
const plannedItems = active.filter((i) => i.automationStatus === 'PLANNED')
const skippedItems = active.filter((i) => i.automationStatus === 'SKIPPED')

log(`Backlog ${items.length}: ${active.length} active (${plannedItems.length} planned, ${skippedItems.length} skipped), ${reconcileClose.length} merged-but-open (reconcile), ${inFlight.length} in-flight, ${dbClosed.length} already closed.`)

// --- Reconcile (close out bugs whose fix already merged) -------------------
phase('Reconcile')
let reconciled = []
if (reconcileClose.length > 0 && RECONCILE && !DRY_RUN) {
  const r = await agent(
    `You are the RECONCILE agent. These bug items each have a fix PR that is ALREADY MERGED, but their status never got written back — so the queue shows them as still-open. Close each one out to RESOLVED so the backlog reflects reality. For EACH item run exactly:
  \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=RESOLVED --note="[defect] Fixed (reconciled) — fix PR #<prNumber> already merged; closing out to match reality."\`
Report one entry per ITEM in \`results\` — an ARRAY of objects, never a JSON string — carrying that item's id, whether the resolve succeeded (\`ok\`), and the prNumber/title. Do nothing else.

ITEMS:
${JSON.stringify(reconcileClose.map((i) => ({ id: i.id, sourceType: i.sourceType, tenantId: i.tenantId, prNumber: i.prNumber, title: i.title })), null, 2)}`,
    { label: 'reconcile', phase: 'Reconcile', schema: RECONCILE_SCHEMA },
  )
  reconciled = reconcileClose.map((i) => ({ id: i.id, prNumber: i.prNumber, title: i.title }))
  // `asArray` is the belt to the schema's braces: if a future model still hands back a stringified
  // array, we parse it rather than counting its characters (the `counts.reconciled = 390` defect).
  const agentResults = asArray(r?.results)
  if (agentResults) reconciled = agentResults
} else if (reconcileClose.length > 0) {
  log(`${reconcileClose.length} merged-but-open item(s) would be reconciled (skipped: ${DRY_RUN ? 'dryRun' : 'reconcile=false'}).`)
}

// NOTE: even when there are ZERO active bugs (the feedback backlog is fully reconciled), we do NOT
// early-return — the PR SWEEP and ISSUE SWEEP triage work that piles up INDEPENDENTLY of the bug
// backlog (orphan PRs; stale plan issues; Sentry noise), so they must still run. The active-item
// stages below (Cluster/Prioritize/Review) simply no-op on an empty `active`, and the two
// LLM-heavy stages that would choke on empty input (Prioritize, Parallelize) are guarded to skip.
const noActiveWork = active.length === 0
if (noActiveWork) log('No active bugs — backlog reconciled. Running the PR + issue sweeps only.')

// --- Cluster (group same-root-cause items across tenants, elect one primary) ---
phase('Cluster')
const itemById = new Map(active.map((i) => [i.id, i]))

// How far along an item is — a duplicate should ride the MOST advanced outcome so we
// never spawn a second fix for a bug already in-PR or already planned.
const advancement = (i) => {
  if (i.prState === 'OPEN' || i.automationStatus === 'PR_OPENED') return 4
  if (i.automationStatus === 'PLANNED') return 3
  if (i.awaitingRunId) return 2
  return 1
}
const sevRank = (s) => (s === 'P0' ? 3 : s === 'P1' ? 2 : s === 'P2' ? 1 : 0)
// Higher advancement, then higher reported severity, then EARLIEST createdAt (ISO strings
// sort lexically — no Date() needed, which is unavailable in workflow scripts).
const betterPrimary = (a, b) => {
  if (advancement(a) !== advancement(b)) return advancement(a) > advancement(b) ? a : b
  if (sevRank(a.severityReported) !== sevRank(b.severityReported)) return sevRank(a.severityReported) > sevRank(b.severityReported) ? a : b
  return (a.createdAt || '') <= (b.createdAt || '') ? a : b
}

let clusterGroups
if (!CLUSTER || active.length <= 1) {
  clusterGroups = active.map((i) => ({ memberIds: [i.id], rootCause: i.title, justification: 'singleton (clustering off or single item)' }))
  if (!CLUSTER) log('Clustering disabled (cluster=false) — every item is its own cluster.')
} else {
  const proposed = await agent(
    `You are the DEDUP agent for a multi-tenant winery ERP bug backlog. Group items that share ONE underlying root cause so that a SINGLE fix (and a single PR) can close all of them. The auto-fix fence is tenant-agnostic app code, so the SAME code bug reported by different tenants is ONE cluster.

BE CONSERVATIVE. Same symptom is NOT the same root cause. Only cluster items when you are confident the underlying defect is identical (same broken flow/component/error, same fix would resolve all). When unsure, leave an item in its own singleton cluster. A wrong cluster can wrongly close a live bug downstream, so err toward singletons.

Rules:
- EVERY id below must appear in EXACTLY ONE cluster. A lone item is a cluster of one.
- Cluster ACROSS tenants when the root cause is tenant-agnostic code.
- PLANNED and PR-bearing (prState OPEN) items ARE eligible to be a cluster's representative — if a fresh NEW ticket duplicates a bug that already has a plan or an open PR, put them in one cluster (so the NEW one rides the existing outcome instead of spawning a second fix).
- justification: one line on WHY the members share a root cause (or why a singleton).
- suggestedPrimaryId: optional hint (the workflow re-elects deterministically).

ITEMS:
${JSON.stringify(active.map((i) => ({ id: i.id, tenantId: i.tenantId, tenantName: i.tenantName, kind: i.kind, title: i.title, body: (i.body || '').slice(0, 600), automationStatus: i.automationStatus, prNumber: i.prNumber, prState: i.prState, awaitingRunId: i.awaitingRunId })), null, 2)}`,
    { label: 'cluster', phase: 'Cluster', schema: CLUSTER_SCHEMA },
  )
  // Normalize deterministically: keep only valid+unassigned ids; any leftover → singleton.
  const assigned = new Set()
  clusterGroups = []
  for (const c of (proposed?.clusters || [])) {
    const memberIds = (c.memberIds || []).filter((id) => itemById.has(id) && !assigned.has(id))
    if (memberIds.length === 0) continue
    memberIds.forEach((id) => assigned.add(id))
    clusterGroups.push({ memberIds, rootCause: c.rootCause || itemById.get(memberIds[0]).title, justification: c.justification || '' })
  }
  for (const i of active) {
    if (!assigned.has(i.id)) { assigned.add(i.id); clusterGroups.push({ memberIds: [i.id], rootCause: i.title, justification: 'singleton (unclustered)' }) }
  }
}

// Elect a primary per cluster + build the fan-out map.
const clusters = clusterGroups.map((g, idx) => {
  const members = g.memberIds.map((id) => itemById.get(id)).filter(Boolean)
  const primary = members.reduce((best, cur) => (best ? betterPrimary(best, cur) : cur), null)
  return {
    clusterId: `c${idx + 1}`,
    primaryId: primary.id,
    memberIds: members.map((m) => m.id),
    tenants: [...new Set(members.map((m) => m.tenantId))],
    tenantCount: new Set(members.map((m) => m.tenantId)).size,
    size: members.length,
    rootCause: g.rootCause,
    justification: g.justification,
  }
})
const primaryIds = new Set(clusters.map((c) => c.primaryId))
// primaryId -> array of DUPLICATE member items (everyone in the cluster except the primary)
const dupsByPrimary = new Map(clusters.map((c) => [c.primaryId, c.memberIds.filter((id) => id !== c.primaryId).map((id) => itemById.get(id))]))
const clusterByPrimary = new Map(clusters.map((c) => [c.primaryId, c]))
const primaries = active.filter((i) => primaryIds.has(i.id))
const duplicateCount = active.length - primaries.length

log(`Clustered ${active.length} active into ${clusters.length} cluster(s); ${primaries.length} primaries, ${duplicateCount} linked-duplicate(s).`)

// --- Prioritize (primaries only) ------------------------------------------
phase('Prioritize')
// Guard: with no active primaries (fully-reconciled backlog) there is nothing to rank — skip the
// LLM call and flow straight to the sweeps, which run regardless of the bug backlog.
const plan = primaries.length === 0
  ? { ranked: [], summary: 'No active bugs to prioritize — the feedback backlog is fully reconciled. See the PR + issue sweeps below for the open-PR and open-issue cleanup.' }
  : await agent(
  `You are the TRIAGE LEAD ("product goalie") for a winery ERP. Below are the PRIMARY items (one representative per root-cause cluster — duplicates and already-shipped/in-flight items were filtered out). Rank every primary and assign a bucket. Think like a goalie: stop the most damaging bugs first, bank the easy wins, don't waste a human on no-brainers. Each primary carries clusterTenantCount — how many tenants report this same bug (blast radius); weight P0/P1 up when several tenants are hit.

For each item:
  - priority: P0 (data corruption / tenant leak / money or inventory wrong / broken core flow / security) > P1 (feature broken, no data risk) > P2 (cosmetic/minor). Reported severity is a hint — re-judge from the title/body.
  - effort: easy | medium | hard. isEasyWin: high-value AND low-risk AND easy.
  - type — the DISPOSITION: what KIND of problem this really is, judged from the ROOT CAUSE. This is the load-bearing axis; the bucket follows from it. The reporter's intake kind ("BUG_REPORT"/"FEATURE_REQUEST"/"Assistant") is only a hint — do NOT trust it (a report titled like a bug is often a product-gap; a 👎 is often model-behavior). Classify as ONE of:
      * "defect"         — a genuine code bug with a concrete code lever a fix agent can pull (wrong logic, crash, broken control, mis-wired handler).
      * "model-behavior" — an LLM/assistant adherence miss: the model said/did the wrong thing (over-claimed a write, picked the wrong tool, ignored an instruction). The root cause is prompt/eval, which is STOCHASTIC — a prompt tweak is a mitigation, never a guaranteed fix. CHECK developerNotes / prior PRs: if a rule/golden for this exact behavior ALREADY shipped and it still recurred, a second identical prompt tweak won't hold — that's needs-human, not a re-dispatch.
      * "product-gap"    — the app has no place for what the user needs: a missing capability, an unmodeled data path, a design decision (e.g. "logging assumes X even when Y"). A feature request wearing a bug costume. Belongs in /plan or /office-hours, NOT the auto-fixer.
      * "not-a-bug"      — works-as-designed, user-error, permissions, or an empty-state mistaken for a failure (e.g. "the data is gone" when the viewer lacks the role or no rows exist yet). No code change is warranted.
      * "unclear"        — genuinely can't tell without investigation (/investigate).
  - bucket — DERIVE it from type (type gates the route; a wrong bucket wastes a fix run or buries a plan):
      * type "not-a-bug"      -> ALWAYS "dismiss" (with the reason).
      * type "product-gap"    -> "route-plan" when automationConflict is null: create/dispatch a PLAN through \`triage:plan\`, never through the auto-fixer. If automationConflict is non-null, use "needs-human" because an AGENTIC_FIX is already queued/running/PR-open and must not be canceled silently.
      * type "unclear"        -> "needs-human" (route to /investigate).
      * type "model-behavior" -> "dispatch" ONLY if a CONCRETE, not-yet-tried in-fence lever exists (a NEW prompt rule or a NEW eval golden in src/lib/assistant + test/) AND awaitingRunId != null AND awaitingRunKind == "AGENTIC_FIX"; flag in rationale that it is a MITIGATION (recurrence possible, a merge does not "close" the behavior). If the lever already shipped once, no lever is obvious, or the awaiting kind is PLAN -> "needs-human".
      * type "defect"         -> route by state:
          - "dispatch"    — NO open PR AND awaitingRunId != null AND awaitingRunKind == "AGENTIC_FIX": kick off the fix agent. An awaiting PLAN is never a fix candidate. BUT if the body/notes say the real fix lives OUTSIDE the auto-fix fence (${'src/app/(app)'}, src/app/api/feedback, src/components, src/lib/assistant) — e.g. it needs src/lib/work-orders, prisma, tenancy — do NOT dispatch (the agent can't fix it); bucket "needs-human" instead.
          - "needs-human" — the fix is out-of-fence, a closed-unmerged PR, or a FAILED run.
   CROSS-CUTTING (apply regardless of type, and take precedence over the type routing above):
      * "review-pr"   — prState OPEN (prNumber set): send to root-cause review, whatever the type.
      * "plan-ready"  — automationStatus == PLANNED: a plan-mode run already produced a PLAN (not code), stored at githubIssueUrl and/or in planMarkdown. Do NOT dispatch or re-plan. Bucket it plan-ready so a human can review the plan and run /work. In rationale, name the plan link (githubIssueUrl) if present.
      * A SKIPPED run: bucket from its developerNotes reason — "dismiss" if it says not-a-bug / wontfix / already-handled (type "not-a-bug"), else "needs-human".
  - erpStandards — a SEPARATE conformance pass on the REQUESTED change (independent of type/priority). Ask: if we built exactly what this item asks for, would it push the system of record OFF-standard? Assign conformance ok | caution | conflict per the rubric below, and for caution/conflict name the concern + the standards implicated. This is judged from the ASK, not from whether the bug is real — a real bug can still have a non-standard requested fix (e.g. "let me just delete that wrong ledger entry" — real pain, but the standard fix is a correction event, not a delete). Be conservative: only "conflict" when the ask genuinely cannot be met without breaking a standard; "caution" when it merely touches a governed area.
${ERP_STANDARDS}
  - rationale: one line, and LEAD with the type + why (e.g. "[product-gap] no lot-level Brix field — needs /plan"). For PLANNED cite the plan link; for SKIPPED quote the skip reason. If erpStandards.conformance is "conflict", SAY SO in the rationale and name the standard — this item must not be auto-built.

Order "ranked" best-action-first. The summary is the plan of attack the operator reads (mention how many duplicates/tenants each big cluster covers).
Pass through awaitingRunId, awaitingRunKind, and automationConflict exactly for every ranked item; the deterministic action gate uses them after your recommendation.

PRIMARY ITEMS (each annotated with its cluster):
${JSON.stringify(primaries.map((i) => ({ ...i, clusterTenantCount: clusterByPrimary.get(i.id)?.tenantCount ?? 1, clusterSize: clusterByPrimary.get(i.id)?.size ?? 1, clusterRootCause: clusterByPrimary.get(i.id)?.rootCause })), null, 2)}`,
  { label: 'prioritize', phase: 'Prioritize', schema: PLAN_SCHEMA },
)

const ranked = (plan?.ranked || [])
// Disposition tally — how the active primaries broke down by KIND of problem (not action).
const byType = ranked.reduce((acc, x) => { const t = x.type || 'unclear'; acc[t] = (acc[t] || 0) + 1; return acc }, {})
// Map the skill's lowercase disposition to the DB enum (FeedbackTriageClass) so the write-back
// persists it structurally via `triage:resolve --triage-class`. Unknown/absent → null (skip flag).
const TYPE_TO_ENUM = { defect: 'DEFECT', 'model-behavior': 'MODEL_BEHAVIOR', 'product-gap': 'PRODUCT_GAP', 'not-a-bug': 'NOT_A_BUG', unclear: 'UNCLEAR' }
const toTriageClass = (t) => TYPE_TO_ENUM[t] || null

// --- Review (root-cause vet every open PR, in parallel) -------------------
phase('Review')
const prItems = ranked.filter((x) => x.bucket === 'review-pr' && x.prNumber && primaryIds.has(x.id))
log(`Root-cause reviewing ${prItems.length} open PR fix(es) (primaries only).`)
const reviews = prItems.length === 0 ? [] : (await parallel(
  prItems.map((x) => () =>
    agent(
      `You are a skeptical FIX REVIEWER for a winery ERP. Judge PR #${x.prNumber} — the proposed fix for this reported problem:
  Title: ${x.title}
  Item: ${x.sourceType} ${x.id}

Do the work, don't pattern-match:
1. \`gh pr view ${x.prNumber} --json title,body,isDraft,mergeable,additions,deletions,changedFiles,labels,url\`
2. \`gh pr diff ${x.prNumber}\` and \`gh pr checks ${x.prNumber}\`. Read the hunks and enough surrounding code to judge intent.
3. THE CENTRAL QUESTION: does the diff fix the ROOT CAUSE, or is it a cosmetic patch / band-aid that hides a deeper bug? Silencing a symptom (swallowing an error, hardcoding a value, hiding a broken control, narrowing a type to dodge a crash) is NOT a root fix. If cosmetic/band-aid, name the deeperIssue: the real underlying problem and where it actually lives (file/function).
3b. ERP-STANDARDS CONFORMANCE — separately from root-cause, judge whether the DIFF upholds the system-of-record standards below. A diff can be a genuine root fix AND still be non-standard (it fixes the symptom by editing a posted record in place, hard-deleting history instead of appending a correction, silencing a conservation guard, widening past the tenant fence, or making the ERP defer to an external system). Set erpStandards ok | caution | conflict and, for caution/conflict, erpConcern (which standard + where). A "conflict" here MUST NOT auto-merge regardless of the other gates.
${ERP_STANDARDS}
4. Merge-safety flags (any red => "do-not"; several yellows => "review"):
   RED: auth/session, secrets/env, DB migration/schema/raw SQL, money/inventory math, mass deletion, disabled tests/guards, LLM writes without scoping, failing/pending CI, conflicts, draft with unresolved review.
   YELLOW: >~10 files or >~400 lines, new dependency, public API change, hardcoded colors/fonts (must use DESIGN.md tokens), no tests for new logic.
5. Gate booleans, precisely:
   - fenceOnly: EVERY changed file is within the allowed fence.
${FENCE}
   - ciGreen: all required checks pass (pending or failing => false). For a PR touching a widened src/lib
     server domain, this INCLUDES the "feedback-domain-verify" check per the DOMAIN PROOF rule above,
     even if it is not yet a branch-protection-required check.
   - sizeOk: <= ~150 changed lines and <= ~8 files.

READ-ONLY. Do not edit, push, or merge. Return the verdict for item id "${x.id}".`,
      { label: `review:pr-${x.prNumber}`, phase: 'Review', schema: REVIEW_SCHEMA },
    ).then((r) => (r ? { ...r, id: x.id, prNumber: x.prNumber } : null)),
  ),
)).filter(Boolean)

// --- Compute action sets (tight gate, re-checked in JS) -------------------
const reviewById = new Map(reviews.map((r) => [r.id, r]))
// The ranked row for an id, when there is one. The merged sweep uses it to keep an already-shipped
// ticket's disposition (type/triageClass) rather than flattening every reconcile to "defect".
const rankedById = new Map(ranked.map((x) => [x.id, x]))

// Attach the cluster's duplicate members to each acted-on primary so Act can fan out.
const dupsOf = (id) => (dupsByPrimary.get(id) || []).map((d) => ({ id: d.id, sourceType: d.sourceType, tenantId: d.tenantId, title: d.title }))

// ERP-STANDARDS GATE. A "conflict" verdict — from the goalie (the requested change is
// off-standard) OR from a PR reviewer (the diff is off-standard) — HARD-BLOCKS every automated
// action: no auto-merge, no dispatch, no plan-route-to-build, no parallel wave. The item still
// gets worked, but by a human who redesigns the ask into a conformant shape first. This is the
// "don't let a real bug's fix quietly turn the ERP into a spreadsheet" backstop.
const erpConflict = (x) =>
  x?.erpStandards?.conformance === 'conflict' || reviewById.get(x?.id)?.erpStandards === 'conflict'
// Every item carrying a caution/conflict verdict (from either lens), for the report + runbook.
const erpStandardsFlags = ranked
  .filter((x) => {
    const g = x.erpStandards?.conformance
    const r = reviewById.get(x.id)?.erpStandards
    return (g && g !== 'ok') || (r && r !== 'ok')
  })
  .map((x) => {
    const r = reviewById.get(x.id)
    const level = erpConflict(x) ? 'conflict' : 'caution'
    return {
      id: x.id, title: x.title, priority: x.priority, type: x.type, bucket: x.bucket,
      level, // conflict = blocked from automation; caution = buildable, standard must be upheld
      concern: x.erpStandards?.concern || r?.erpConcern || null,
      standards: x.erpStandards?.standards || [],
      source: reviewById.get(x.id)?.erpStandards && reviewById.get(x.id).erpStandards !== 'ok' ? 'pr-diff' : 'requested-change',
    }
  })

const mergeCandidates = ranked
  .filter((x) => x.bucket === 'review-pr' && x.prNumber)
  .map((x) => ({ item: x, review: reviewById.get(x.id) }))
  .filter(({ item, review }) =>
    AUTO_MERGE && review &&
    review.assessment === 'root-fix' &&
    review.addressesRootCause === true &&
    review.mergeSafety === 'safe' &&
    review.fenceOnly === true &&
    review.ciGreen === true &&
    review.sizeOk === true &&
    review.erpStandards !== 'conflict' && !erpConflict(item), // ERP-standards gate
  )
  .slice(0, MAX_MERGES)

const dispatchCandidates = ranked
  .filter((x) => x.bucket === 'dispatch' && x.awaitingRunId && x.awaitingRunKind === 'AGENTIC_FIX' && DISPATCH && !erpConflict(x))
  .slice(0, MAX_DISPATCH)

const planRouteCandidates = ranked
  .filter((x) => x.bucket === 'route-plan' && x.type === 'product-gap' && !x.automationConflict && DISPATCH && !erpConflict(x))
  .slice(0, MAX_DISPATCH)

const dismissCandidates = ranked.filter((x) => x.bucket === 'dismiss')
const planReadyCandidates = ranked.filter((x) => x.bucket === 'plan-ready')

const mergeSet = new Set(mergeCandidates.map((c) => c.item.id))
const dispatchSet = new Set(dispatchCandidates.map((c) => c.id))
const planRouteSet = new Set(planRouteCandidates.map((c) => c.id))
const dismissSet = new Set(dismissCandidates.map((c) => c.id))
const planReadySet = new Set(planReadyCandidates.map((c) => c.id))
const queuedForHuman = ranked
  .filter((x) => !mergeSet.has(x.id) && !dispatchSet.has(x.id) && !planRouteSet.has(x.id) && !dismissSet.has(x.id) && !planReadySet.has(x.id))
  .map((x) => {
    const r = reviewById.get(x.id)
    const c = clusterByPrimary.get(x.id)
    // When an ERP-standards conflict is why this is queued (not merged/dispatched), lead the
    // verdict with it so the human knows the ask must be redesigned before any build.
    const erpNote = erpConflict(x)
      ? ` ⚠️ ERP-STANDARDS CONFLICT — ${x.erpStandards?.concern || r?.erpConcern || 'requested change is off-standard'}; redesign into a conformant shape (correction event / supersede / outbox) before building.`
      : ''
    return {
      id: x.id, sourceType: x.sourceType, tenantId: x.tenantId, title: x.title,
      priority: x.priority, type: x.type, triageClass: toTriageClass(x.type), bucket: x.bucket, prNumber: x.prNumber ?? null,
      tenantCount: c?.tenantCount ?? 1, duplicates: dupsOf(x.id),
      erpStandards: erpConflict(x) ? 'conflict' : (x.erpStandards?.conformance || 'ok'),
      verdict: (r
        ? `[${x.type}] PR #${x.prNumber}: ${r.assessment}/${r.mergeSafety}${r.deeperIssue ? ` — deeper issue: ${r.deeperIssue}` : ''} — ${r.recommendation}`
        : x.rationale) + erpNote,
      mergeCommand: x.prNumber ? `gh pr merge ${x.prNumber} --squash --delete-branch` : null,
    }
  })

// --- Is the "plan" a plan? (boilerplate plan-issue detection) --------------
// A "plan-ready" item is only buildable if its plan issue actually CONTAINS a plan. It usually does
// not: every `feedback: plan` issue is opened from a static template, and nothing writes plan text
// back to the ticket, so the issue reads "Plan only; no code changes" / "Review the linked app
// feedback item in the developer console" and nothing else. Telling someone to `/work` that is
// telling them to build a stub. Fetch each plan issue, judge it in JS, and route the stubs to
// PLAN-FIRST instead. (Observed on #466, which pointed at exactly this boilerplate.)
const planStubById = new Map()
const planIssueRefs = planReadyCandidates
  .map((c) => ({ id: c.id, url: itemById.get(c.id)?.githubIssueUrl ?? null }))
  .filter((r) => r.url)
if (planIssueRefs.length > 0) {
  const bodies = await agent(
    `You are the PLAN-ISSUE BODY agent. Fetch the body of each GitHub issue below VERBATIM so the workflow can judge whether it contains a real plan or is an empty template stub. For EACH:
  \`gh issue view <number> --repo russellmoss/wine-inventory --json number,state,body\`
(the issue number is the trailing path segment of the url). Return one entry per INPUT id, echoing the id verbatim, with the body EXACTLY as fetched (truncate only past ~4000 chars). Do NOT summarize, reformat, judge, or "improve" the body — the workflow does the judging and a paraphrase would defeat it. If an issue cannot be read (deleted / not found / bad url), return that id with body=null and a short \`error\`. READ-ONLY: do not comment, label, close, or edit anything.

ISSUES:
${JSON.stringify(planIssueRefs, null, 2)}`,
    { label: 'plan-issue-bodies', phase: 'Review', schema: PLAN_STUB_SCHEMA },
  )
  const wanted = new Set(planIssueRefs.map((r) => r.id))
  for (const row of (bodies?.issues || [])) {
    if (!wanted.has(row.id)) continue
    // Unreadable issue => NOT a stub. We only downgrade an item on positive evidence that the plan
    // is boilerplate; a failed fetch must not silently reroute real work to /plan.
    if (row.error || row.body == null) continue
    const verdict = assessPlanBody(row.body)
    if (verdict.stub) {
      planStubById.set(row.id, {
        issueNumber: row.issueNumber ?? null,
        url: planIssueRefs.find((r) => r.id === row.id)?.url ?? null,
        reason: verdict.substantiveChars === 0
          ? 'plan issue is the empty automation template — no plan content at all'
          : `plan issue is ~${Math.round(verdict.coverage * 100)}% boilerplate (${verdict.substantiveChars} chars of real content) — no buildable plan`,
      })
    }
  }
  if (planStubById.size > 0) {
    log(`⚠️ ${planStubById.size}/${planIssueRefs.length} "plan-ready" item(s) point at a BOILERPLATE plan issue — routing to /plan, not /work.`)
  }
}
const isPlanStub = (id) => planStubById.has(id)

// --- PR Sweep (triage EVERY open PR, not just feedback-linked ones) --------
// The feedback path above only sees a PR when an ACTIVE feedback item points at it. PRs built
// but never resolved — agentic-fix drafts left un-merged, automation-loop pileups (e.g. three
// copies of the same docs-refresh), standalone feats — are invisible to it and accumulate. This
// sweep enumerates all open PRs, sets aside the ones the feedback path already claimed, and
// buckets the rest: merge (clears the tight gate, un-draft first) / close (RECOMMEND only —
// superseded/duplicate/stale) / fix-first (failing/conflicting) / needs-human.
phase('PR Sweep')
// prNumbers the feedback Review already handled — don't double-process them here.
const claimedPrNumbers = new Set([
  ...prItems.map((x) => x.prNumber),
  ...mergeCandidates.map((c) => c.item.prNumber),
].filter(Boolean))
// Map prNumber -> a backlog item (ANY status) so a swept merge can still close its feedback item.
const backlogByPrNumber = new Map()
for (const it of items) { if (it.prNumber) backlogByPrNumber.set(it.prNumber, it) }
const allItemIds = new Set(items.map((i) => i.id))

let sweepReviews = []
let orphanPrs = []
let sweptMergeCandidates = []
let sweptCloseRecommend = []
let sweptFixFirst = []
let sweptNeedsHuman = []
// id -> DB truth for a linked ticket the sweep discovered but intake never surfaced (aged out
// of triage:list's per-tenant cap). Lets a swept merge reconcile that ticket anyway.
let linkedTicketById = new Map()
if (!SWEEP_PRS) {
  log('PR sweep disabled (sweepPrs=false) — only feedback-linked PRs were reviewed.')
} else {
  const prList = await agent(
    `You are the PR-INTAKE agent for a winery ERP. Enumerate EVERY open pull request so the goalie can clear the PR backlog (PRs built but never resolved). Run, don't guess:
  \`gh pr list --repo russellmoss/wine-inventory --state open --limit 100 --json number,title,isDraft,mergeable,mergeStateStatus,statusCheckRollup,headRefName,additions,deletions,changedFiles,createdAt,body,url\`
For EACH pr return: number, title, headRefName, isDraft, mergeable (map gh's "MERGEABLE"/"CONFLICTING"/"UNKNOWN" — CONFLICTING == a dirty/conflicted branch), ciState (roll up statusCheckRollup: any FAILURE/ERROR/CANCELLED/TIMED_OUT => "failing"; else any PENDING/QUEUED/IN_PROGRESS/EXPECTED => "pending"; else if there are checks and all passed => "green"; else "none"), changedFiles, additions, deletions, createdAt, body (truncate to ~400 chars), url. Include ALL open PRs.`,
    { label: 'pr-intake', phase: 'PR Sweep', schema: PR_LIST_SCHEMA },
  )
  const allPrs = (prList?.prs || [])
  orphanPrs = allPrs.filter((p) => !claimedPrNumbers.has(p.number))
  log(`Open PRs: ${allPrs.length} total, ${claimedPrNumbers.size} already handled by the feedback path, ${orphanPrs.length} to sweep.`)

  if (orphanPrs.length > 0) {
    // Sibling summary (title + files + age + state) so each reviewer can spot supersede/duplicate groups.
    const siblingSummary = orphanPrs.map((p) => `#${p.number} "${p.title}" [${p.isDraft ? 'draft' : 'ready'}, ${p.mergeable}, ci:${p.ciState}, ${p.changedFiles ?? '?'}f, ${p.createdAt || '?'}]`).join('\n')
    sweepReviews = (await parallel(
      orphanPrs.map((p) => () =>
        agent(
          `You are a skeptical PR-SWEEP REVIEWER for a winery ERP. Judge open PR #${p.number} ("${p.title}") on its OWN merits (it is NOT tied to a specific reported bug in this run) and decide what should happen to it. Do the work:
1. \`gh pr view ${p.number} --json title,body,isDraft,mergeable,additions,deletions,changedFiles,labels,url,headRefName\`
2. \`gh pr diff ${p.number}\` and \`gh pr checks ${p.number}\`. Read the hunks + enough surrounding code to judge intent and completeness.
3. DECIDE sweepBucket:
   - "merge"       — a COMPLETE, correct change that clears the tight gate (fence-only, CI green, merge-safe, small, ERP-standards ok) and is mergeable (no conflict). A DRAFT can be "merge" ONLY if it is genuinely finished (green CI, coherent diff, no WIP/TODO markers, description reads done) — the sweep will un-draft it before merging. If you are unsure a draft is complete, DO NOT pick merge — pick needs-human.
   - "close"       — superseded, a duplicate of another open PR, or stale-and-conflicting/abandoned. Set closeReason (name the superseding PR: "superseded by #N") and supersededByPr. Use the sibling list below to spot duplicate groups (e.g. several PRs with the same title touching the same files — keep the newest/cleanest, close the rest). This is a RECOMMENDATION only; the sweep never auto-closes.
   - "fix-first"   — the change is wanted but CI is failing or the branch conflicts (mergeable CONFLICTING) — it needs work before it can land.
   - "needs-human" — out-of-fence, large, a real feature (auth/schema/etc.), or anything that needs a human's eyes/decision.
4. complete: is this a finished change (not WIP)? Be conservative on drafts.
5. ERP-STANDARDS: judge whether the DIFF upholds the system-of-record standards. A "conflict" never auto-merges.
${ERP_STANDARDS}
6. Gate booleans, precisely (same as the feedback reviewer):
   - fenceOnly: EVERY changed file within the allowed fence.
${FENCE}
   - ciGreen: all required checks pass (pending or failing => false). Includes "feedback-domain-verify" per the DOMAIN PROOF rule for widened src/lib domains.
   - sizeOk: <= ~150 changed lines and <= ~8 files.
7. linkedFeedbackId: if the PR ties to a feedback item, return that item's id so a merge can close it. Agentic-fix PRs state it in the BODY, e.g. "Automated fix from bug ticket \`<id>\`" — prefer that FULL id (a ~25-char cuid). A branch like \`feedback-bug/<shortid>\` carries only a TRUNCATED prefix, so read the full id from the body, not the branch. Null if there is no clear tie.

SIBLING OPEN PRs (for supersede/duplicate detection):
${siblingSummary}

READ-ONLY. Do not edit, push, merge, or close anything. Return the verdict for PR #${p.number}.`,
          { label: `sweep:pr-${p.number}`, phase: 'PR Sweep', schema: PR_SWEEP_REVIEW_SCHEMA },
        ).then((r) => (r ? { ...r, prNumber: p.number, title: p.title, isDraft: p.isDraft, url: p.url } : null)),
      ),
    )).filter(Boolean)

    const sweepByPr = new Map(sweepReviews.map((r) => [r.prNumber, r]))
    // Deterministic gate — auto-merge only what genuinely clears the bar (re-checked in JS).
    sweptMergeCandidates = orphanPrs
      .map((p) => ({ pr: p, review: sweepByPr.get(p.number) }))
      .filter(({ pr, review }) =>
        AUTO_MERGE && review &&
        review.sweepBucket === 'merge' &&
        review.complete === true &&
        ['root-fix', 'docs', 'chore'].includes(review.assessment) && // a real, non-band-aid change
        review.mergeSafety === 'safe' &&
        review.fenceOnly === true &&
        review.ciGreen === true &&
        review.sizeOk === true &&
        review.erpStandards !== 'conflict' &&
        // Block only a KNOWN conflict. GitHub returns mergeable=UNKNOWN whenever `main` just
        // moved (it recomputes lazily), so a genuinely-clean PR often reads UNKNOWN right after
        // another merge — treating that as a blocker wrongly holds back good candidates. The Act
        // agent re-checks `gh pr view --json mergeable` immediately before merging and refuses a
        // non-MERGEABLE at that point, so UNKNOWN here is safe to pass through to that live gate.
        pr.mergeable !== 'CONFLICTING',
      )
      .slice(0, MAX_SWEEP_MERGES)
    const sweptMergeSet = new Set(sweptMergeCandidates.map((c) => c.pr.number))
    // Everything not auto-merged: recommend-close / fix-first / needs-human (+ merge-leaning
    // that missed the gate falls to needs-human so a person can finish it off).
    sweptCloseRecommend = sweepReviews.filter((r) => r.sweepBucket === 'close')
    sweptFixFirst = sweepReviews.filter((r) => r.sweepBucket === 'fix-first')
    sweptNeedsHuman = sweepReviews.filter((r) =>
      !sweptMergeSet.has(r.prNumber) && r.sweepBucket !== 'close' && r.sweepBucket !== 'fix-first')
    log(`Sweep verdicts: ${sweptMergeCandidates.length} auto-merge, ${sweptCloseRecommend.length} recommend-close, ${sweptFixFirst.length} fix-first, ${sweptNeedsHuman.length} needs-human.`)

    // OPTION 1 — reconcile linked tickets the sweep discovered even when intake never surfaced
    // them. A fix PR names its source ticket in the body/branch (feedback-bug/<id>); the reviewer
    // returns it as linkedFeedbackId. For any merge candidate whose linked ticket is NOT in the
    // (capped) in-window backlog, look it up straight from the DB so the merge can close it.
    // Only ids the in-window backlog does NOT already carry (by id) — those are handled by the
    // normal path; these aged out of the intake cap and need a direct DB lookup.
    const lookupIds = [...new Set(
      sweptMergeCandidates
        .map((c) => c.review.linkedFeedbackId)
        .filter((id) => id && !allItemIds.has(id)),
    )]
    if (lookupIds.length > 0) {
      log(`Looking up ${lookupIds.length} linked ticket(s) the intake window missed (aged-out): ${lookupIds.join(', ')}.`)
      const looked = await agent(
        `You are the LINKED-TICKET LOOKUP agent. The PR sweep is about to merge fix PRs whose source feedback tickets aged out of the intake window, so they must be reconciled to RESOLVED after merge. Resolve their DB truth. Run exactly:
  \`npm run triage:lookup -- --ids=${lookupIds.join(',')}\`
It prints a JSON object (after npm's log lines — parse the JSON only) with { contractVersion:1, found: [{ id, tenantId, sourceType, status, automationStatus, prUrl, prNumber, title, isOpen }], missing: [ids] }. Return that object verbatim. Do NOT write anything.`,
        { label: 'ticket-lookup', phase: 'PR Sweep', schema: TICKET_LOOKUP_SCHEMA },
      )
      for (const row of (looked?.found || [])) linkedTicketById.set(row.id, row)
    }
  }
}

// --- Merged Sweep (work that ALREADY SHIPPED in a PR nothing stamped on the ticket) ----
// THE BLIND SPOT this closes (observed 2026-07-23). Three facts combined to make triage re-offer
// production code as new work:
//   1. PR #468 was hand-built by a parallel session, not dispatched by the feedback automation, so
//      nothing ever wrote the PR onto ticket cmrwdgt2u… — its `prNumber` stayed null.
//   2. Intake's Reconcile only closes items that HAVE a resolved fix PR. A null prNumber means the
//      item is never even a candidate.
//   3. The PR sweep enumerates only OPEN PRs. A PR that merged BEFORE the run is invisible to it, so
//      the `linkedFeedbackId` body-extraction that already works for sweep-merged PRs never ran.
// So: scan the RECENTLY MERGED PRs too, extract feedback ids from their BODIES, and reconcile.
// SAFETY: extraction is permissive (shape + proximity, since PR wording varies), but every write is
// gated on `triage:lookup` DB truth — a bogus id comes back `missing`, and only `isOpen === true`
// is ever written. An already RESOLVED/DISMISSED ticket is never rewritten. Bounded by a count cap
// AND a mergedAt cutoff so this never walks the whole PR history.
phase('Merged Sweep')
let mergedScan = { scanned: 0, prsWithIds: 0, candidates: [], skipped: [], notes: null }
let mergedReconcileJobs = []
if (!SWEEP_MERGED) {
  log('Merged-PR sweep disabled (sweepMergedPrs=false) — already-shipped work will not be reconciled.')
} else {
  const cutoffClause = MERGED_SINCE
    ? `Then DROP any PR whose mergedAt is EARLIER than ${MERGED_SINCE} — this run only cares about recent merges.`
    : `No date cutoff was supplied, so the --limit above is the whole bound; do not page for more.`
  const scan = await agent(
    `You are the MERGED-PR SCAN agent for a winery ERP's bug-triage goalie. Work that already SHIPPED must never be re-offered as new work — but a PR built by hand (rather than dispatched by the feedback automation) never gets stamped onto its source ticket, so the ticket still reads open. Your job: find the feedback ticket ids named in recently-merged PRs. Run, don't guess:
  \`gh pr list --repo russellmoss/wine-inventory --state merged --limit ${MAX_MERGED_SCAN} --json number,title,body,mergedAt,mergeCommit,url\`
${cutoffClause}

For EACH remaining PR return: number, title, mergedAt, mergeCommit (the \`oid\`), url, and \`feedbackIds\` — EVERY feedback/ticket id its BODY names.

HOW TO MATCH — by SHAPE and PROXIMITY, not by one fixed template. PR bodies phrase this differently:
  - a hand-built PR: "Closes the feedback item \\\`cmrwdgt2u0001l504jub6oogx\\\`"
  - a dispatched agentic-fix PR: "Automated fix from bug ticket \\\`<id>\\\`"
  - others: "feedback ticket <id>", "resolves feedback <id>", "bug report <id>", "ticket: <id>", often inside backticks and sometimes in a trailing metadata block.
So: scan the WHOLE body (not just the first line) for tokens shaped like a cuid — a leading \`c\` followed by ~20-31 lowercase letters/digits, no dashes — that sit near any of the words feedback / ticket / bug / report / item / closes / fixes / resolves. Return every such token.
  - Return the id EXACTLY as written; never repair, complete, or invent one. If you are unsure whether a token is an id, INCLUDE it — the workflow validates every id against the database and silently drops anything that is not a real ticket, so a false positive is harmless while a miss is the bug being fixed.
  - Ignore commit shas (40 hex chars, and hex-only), branch names, and issue/PR numbers — those are not ticket ids.
  - A PR that names none gets \`feedbackIds: []\`. Do NOT guess one from the title.
Also return \`evidence\`: the short phrase an id was found in, so a human can audit the match. Set \`scanned\` to how many merged PRs you actually examined.

READ-ONLY. Do not merge, close, comment, or edit anything.`,
    { label: 'merged-pr-scan', phase: 'Merged Sweep', schema: MERGED_PR_SCAN_SCHEMA },
  )

  const mergedPrs = (scan?.prs || [])
  mergedScan.scanned = Number.isInteger(scan?.scanned) ? scan.scanned : mergedPrs.length
  mergedScan.notes = scan?.notes || null

  // ids this run already handles through another path — reconciling them twice would double-write
  // (and, for an item mid-merge/mid-dispatch, race the Act agent's own write-back).
  const alreadyHandledIds = new Set([
    ...dbClosed.map((i) => i.id),                       // already RESOLVED/DISMISSED in the DB
    ...reconcileClose.map((i) => i.id),                 // intake's reconcile owns these
    // a PR this run is about to sweep-merge will close its own linked ticket in Act §G
    ...sweptMergeCandidates.map((c) => c.review?.linkedFeedbackId).filter(Boolean),
  ])

  // Shape-gate + dedupe + attribute each candidate id to its PR (earliest merge wins — that is the
  // PR that actually shipped the work; a later PR merely touched it again).
  const byId = new Map()
  for (const pr of mergedPrs) {
    const ids = (pr.feedbackIds || []).map((s) => String(s).trim()).filter(looksLikeFeedbackId)
    if (ids.length > 0) mergedScan.prsWithIds += 1
    for (const id of ids) {
      if (alreadyHandledIds.has(id)) {
        mergedScan.skipped.push({ id, prNumber: pr.number, why: 'already closed or handled by another path this run' })
        continue
      }
      const prev = byId.get(id)
      if (!prev || (pr.mergedAt && prev.mergedAt && pr.mergedAt < prev.mergedAt)) {
        byId.set(id, { id, prNumber: pr.number, prUrl: pr.url ?? null, prTitle: pr.title ?? null, mergedAt: pr.mergedAt ?? null, mergeCommit: pr.mergeCommit ?? null, evidence: pr.evidence ?? null })
      }
    }
  }
  const candidateIds = [...byId.keys()]
  log(`Merged sweep: ${mergedScan.scanned} merged PR(s) scanned${MERGED_SINCE ? ` (since ${MERGED_SINCE})` : ''}, ${mergedScan.prsWithIds} naming a ticket, ${candidateIds.length} candidate id(s) to verify.`)

  if (candidateIds.length > 0) {
    // DB TRUTH. This is the gate that makes permissive extraction safe: a hallucinated or garbled id
    // comes back in `missing` and dies here, and `isOpen` is what decides whether we write at all.
    const looked = await agent(
      `You are the MERGED-SWEEP TICKET LOOKUP agent. The merged-PR scan pulled candidate feedback-ticket ids out of merged PR bodies; some may not be real tickets and some may already be closed. Resolve their DB truth — do NOT judge, do NOT write. Run exactly:
  \`npm run triage:lookup -- --ids=${candidateIds.join(',')}\`
It prints a JSON object (after npm's own log lines — parse the JSON only) with { contractVersion:1, found: [{ id, tenantId, sourceType, status, automationStatus, prUrl, prNumber, title, isOpen }], missing: [ids] }. Return that object verbatim, including \`missing\` — an id that is not a real ticket MUST come back in \`missing\`, never invented into \`found\`. If the command errors for lack of .env, say so and STOP.`,
      { label: 'merged-ticket-lookup', phase: 'Merged Sweep', schema: TICKET_LOOKUP_SCHEMA },
    )
    const foundById = new Map((looked?.found || []).filter((r) => byId.has(r.id)).map((r) => [r.id, r]))
    for (const id of candidateIds) {
      const row = foundById.get(id)
      const hit = byId.get(id)
      if (!row) { mergedScan.skipped.push({ id, prNumber: hit.prNumber, why: 'no such feedback ticket in the DB (not a real id)' }); continue }
      // NEVER rewrite a ticket that is already closed — reconciliation is for tickets still lying.
      if (row.isOpen !== true) { mergedScan.skipped.push({ id, prNumber: hit.prNumber, why: `already ${row.status} — left alone` }); continue }
      const rank = rankedById.get(id)
      mergedReconcileJobs.push({
        id, tenantId: row.tenantId, sourceType: row.sourceType,
        title: row.title || rank?.title || hit.prTitle || null,
        status: row.status,
        prNumber: hit.prNumber, prUrl: hit.prUrl, prTitle: hit.prTitle,
        mergedAt: hit.mergedAt, mergeCommit: hit.mergeCommit, evidence: hit.evidence,
        // Keep the disposition the run already reasoned its way to when it ranked this item;
        // otherwise it is a plain defect that shipped.
        type: rank?.type || 'defect',
        triageClass: toTriageClass(rank?.type || 'defect'),
        inWindow: allItemIds.has(id),
        fanOut: dupsOf(id),
      })
    }
    const overflow = mergedReconcileJobs.slice(MAX_MERGED_RECONCILE)
    for (const o of overflow) mergedScan.skipped.push({ id: o.id, prNumber: o.prNumber, why: `beyond the maxMergedReconcile cap of ${MAX_MERGED_RECONCILE} — reconcile next run or raise the cap` })
    if (overflow.length > 0) log(`⚠️ ${overflow.length} already-shipped ticket(s) exceed the maxMergedReconcile cap of ${MAX_MERGED_RECONCILE} and were NOT reconciled — they are listed in the runbook.`)
    mergedReconcileJobs = mergedReconcileJobs.slice(0, MAX_MERGED_RECONCILE)
  }
  mergedScan.candidates = mergedReconcileJobs.map((j) => ({ id: j.id, prNumber: j.prNumber, status: j.status, title: j.title }))
  log(`Merged sweep: ${mergedReconcileJobs.length} still-open ticket(s) whose work ALREADY SHIPPED${DRY_RUN ? ' (dry run — nothing written)' : ''}, ${mergedScan.skipped.length} skipped.`)
}

// ids the merged sweep is closing out. They must NOT also be dispatched / plan-routed / marked
// "plan ready — run /work" this run: the work is already in production. This is the whole point —
// the observed failure was triage ranking a shipped ticket as the run's one actionable item.
const mergedReconciledIds = new Set(mergedReconcileJobs.map((j) => j.id))
const notShipped = (id) => !mergedReconciledIds.has(id)
const actMergeCandidates = mergeCandidates.filter((c) => notShipped(c.item.id))
const actDispatchCandidates = dispatchCandidates.filter((c) => notShipped(c.id))
const actPlanRouteCandidates = planRouteCandidates.filter((c) => notShipped(c.id))
const actDismissCandidates = dismissCandidates.filter((c) => notShipped(c.id))
const actPlanReadyCandidates = planReadyCandidates.filter((c) => notShipped(c.id))
const actQueuedForHuman = queuedForHuman.filter((q) => notShipped(q.id))
const supersededByShipped = ranked.filter((x) => mergedReconciledIds.has(x.id)).map((x) => ({ id: x.id, title: x.title, bucket: x.bucket }))
if (supersededByShipped.length > 0) {
  log(`↩️ ${supersededByShipped.length} ranked item(s) pulled OUT of this run's actions — already shipped: ${supersededByShipped.map((s) => `${s.id} (was ${s.bucket})`).join(', ')}.`)
}

// --- Issue Sweep (triage EVERY open GitHub issue, the OTHER untouched pile) -----
// The PR sweep clears built-but-unresolved PRs; this clears the open-ISSUE backlog. Two classes
// accumulate: (1) "feedback: plan" issues the plan automation opened but nothing ever closed when
// the ticket resolved — auto-reconciled CLOSED on provable DB truth (ticket RESOLVED/DISMISSED); and
// (2) Sentry error issues — mostly noise (dev-worktree paths, guards firing as designed) — clustered,
// classified, and RECOMMEND-closed (never auto), with genuine bugs surfaced for a human. Same
// safety spine as the PR sweep: auto-act ONLY on mechanical reconciliation, recommend-only otherwise.
phase('Issue Sweep')
let issueSweep = { scanned: 0, reconcileClosed: [], recommendClose: [], routeBug: [], kept: 0, notes: null }
// Reconciliation closes the Act agent (or the dry-run report) consumes — each provably stale.
let issueCloseJobs = []
if (!SWEEP_ISSUES) {
  log('Issue sweep disabled (sweepIssues=false) — open GitHub issues not triaged this run.')
} else {
  // 1. Enumerate + partition EVERY open issue (mechanical). 2. In parallel, resolve the uncapped
  //    plan-issue → ticket map from the DB (the issue text can't tell us the ticket, only the DB can).
  const [issueList, planMap] = await parallel([
    () => agent(
      `You are the ISSUE-INTAKE agent for a winery ERP's bug-triage goalie. Enumerate EVERY open GitHub issue so the goalie can clear the issue backlog. Run, don't guess:
  \`gh issue list --repo russellmoss/wine-inventory --state open --limit 200 --json number,title,labels,author,createdAt\`
For EACH issue return number, title, author (the login, e.g. "app/sentry" / "app/github-actions"), labels (name array), createdAt, and issueClass — classify MECHANICALLY (do not judge the bug yet):
  - "feedback-plan" — a plan-automation issue: author is app/github-actions AND the title starts with "feedback: plan". These are reconciled against DB truth, never closed on their text.
  - "sentry"        — a Sentry-filed error: it has a "sentry" label OR author app/sentry.
  - "other"         — anything else (a hand-filed engineering issue); left for a human.
Return ALL open issues.`,
      { label: 'issue-intake', phase: 'Issue Sweep', schema: ISSUE_LIST_SCHEMA },
    ),
    () => agent(
      `You are the PLAN-ISSUE MAP agent. The plan automation opens a "feedback: plan …" GitHub issue for each PLAN run and stamps its URL on the source feedback ticket — but the issue's title/body carries only the PLAN-RUN id, NOT the ticket id, so the issue can only be mapped back to its ticket through the DB. Resolve that map. Run exactly:
  \`npm run triage:issues\`
It prints a JSON object (after npm's log lines — parse the JSON only) with { contractVersion:1, planIssues: [{ issueNumber, issueUrl, ticketId, tenantId, sourceType, status, automationStatus, prNumber, prUrl, title, isOpen, prMerged }] }. Return the planIssues array verbatim (each object needs at least issueNumber, ticketId, tenantId, sourceType, status, isOpen). Do NOT write anything. If the command errors for lack of .env, say so and STOP.`,
      { label: 'plan-issue-map', phase: 'Issue Sweep', schema: PLAN_ISSUE_MAP_SCHEMA },
    ),
  ])

  const openIssues = (issueList?.issues || [])
  issueSweep.notes = issueList?.notes || null
  issueSweep.scanned = openIssues.length
  const openNumbers = new Set(openIssues.map((i) => i.number))
  const planByIssueNumber = new Map((planMap?.planIssues || []).map((p) => [p.issueNumber, p]))
  log(`Open issues: ${openIssues.length} total — ${openIssues.filter((i) => i.issueClass === 'feedback-plan').length} plan, ${openIssues.filter((i) => i.issueClass === 'sentry').length} sentry, ${openIssues.filter((i) => i.issueClass === 'other').length} other.`)

  // 2a. RECONCILE plan issues against DB truth (the ONLY auto-close class). A plan issue is stale
  //     and closeable iff it maps to a ticket that is NOT open (RESOLVED/DISMISSED) — provable, so
  //     it's a mechanical close (capped). A plan issue OPEN on GitHub but with NO DB mapping is an
  //     orphan (ticket deleted/unlinked) — RECOMMEND-close only, never auto (we can't prove it done).
  const planIssuesOpen = openIssues.filter((i) => i.issueClass === 'feedback-plan')
  const reconcilable = []
  const orphanPlanIssues = []
  for (const iss of planIssuesOpen) {
    const t = planByIssueNumber.get(iss.number)
    if (t && t.isOpen === false) reconcilable.push({ ...iss, ticket: t })
    else if (!t) orphanPlanIssues.push(iss)
    // t && t.isOpen === true => keep (the feedback path still owns it); counted in "kept" below.
  }
  issueCloseJobs = reconcilable.slice(0, MAX_ISSUE_CLOSES).map((r) => ({
    number: r.number, title: r.title,
    ticketId: r.ticket.ticketId, ticketStatus: r.ticket.status, tenantId: r.ticket.tenantId,
    reason: `source ticket ${r.ticket.ticketId} is ${r.ticket.status} — the plan issue is stale`,
  }))
  const overflowReconcile = reconcilable.slice(MAX_ISSUE_CLOSES) // beyond the cap → recommend-close

  // 2b. Classify the Sentry (and any "other") issues — recommend-only. One agent judges all of them.
  const sentryIssues = openIssues.filter((i) => i.issueClass === 'sentry')
  let sentryVerdicts = []
  if (sentryIssues.length > 0) {
    const sentryList = sentryIssues.map((i) => `#${i.number} "${i.title}"${i.createdAt ? ` [${i.createdAt}]` : ''}`).join('\n')
    const sv = await agent(
      `You are the SENTRY TRIAGE agent for a winery ERP. Sentry auto-files each captured error as a GitHub issue and they pile up — most are NOT actionable bugs. Judge EACH issue below into ONE disposition.

READ THE FULL STACK before you decide — never judge from the title alone. For ANY issue you lean toward "real-bug" you MUST first run \`gh issue view <n> --repo russellmoss/wine-inventory --json title,body\` and scan EVERY frame top-to-bottom. The #1 false positive is a DEV-WORKTREE event whose TOP frames look prod-clean (\`src\\lib\\…\`, \`src\\app\\…\`) while a \`.claude\\worktrees\\<name>\\…\` (or a \`.next\\dev\`) path sits DEEPER in the frames — that is development, not production. If a worktree path appears ANYWHERE in the stack, it is "dev-noise", full stop, no matter how clean the top looks. (This exact miss once mislabeled a stale, already-fixed error as a real bug and sent a human to investigate a non-bug.)
Dispositions:
  - "dev-noise"           — a DEVELOPMENT-context error, not production: a \`.claude\\worktrees\\…\` path ANYWHERE in the stack (even when the top frames are prod-clean src/…), a \`.next\\dev\` / localhost / build-time artifact, or a one-off from a branch. Recommend closing.
  - "expected-validation" — a DOMAIN GUARD firing as DESIGNED, mis-captured as an error, not a defect: "Not enough stock…", "Barrel … is empty", "would exceed capacity", "Automation is currently running", "No vessel matches …". The system correctly refused an invalid action. Recommend closing AND set suggestFilter=true (a Sentry beforeSend/ignore rule should stop this class recurring).
  - "config-or-fixed"     — a config/setup error ("default secret", "Failed to get session"), OR one whose failing code path was likely ALREADY FIXED on current main. When the stack names a specific file+line, sanity-check whether main STILL has that failing pattern before calling it real — a dev-worktree event captured mid-development of a feature that later shipped corrected (e.g. a "No tenant context" from a read core that now uses the extended \`prisma\`) belongs here, not in real-bug. Recommend closing (a human confirms).
  - "real-bug"            — a genuine defect worth fixing ON CURRENT MAIN: an unexpected crash (ReferenceError, hydration error, a true "No tenant context" leak in a real PROD code path, an N+1). Assign this ONLY after confirming the full stack has NO worktree path AND the failing path still exists on main. Do NOT recommend closing — surface it to route to /investigate.
  - "keep"                — genuinely can't tell; leave it open.
Be conservative in BOTH directions: when unsure, prefer "keep" — do NOT default to "real-bug" from the message alone (it sends a human chasing a non-bug), and do not aggressively close either (closes are recommend-only). Return a verdict for EVERY number below.

OPEN SENTRY ISSUES:
${sentryList}`,
      { label: 'sentry-triage', phase: 'Issue Sweep', schema: SENTRY_TRIAGE_SCHEMA },
    )
    sentryVerdicts = (sv?.verdicts || []).filter((v) => openNumbers.has(v.number))
    if (sv?.notes) issueSweep.notes = [issueSweep.notes, sv.notes].filter(Boolean).join(' | ')
  }

  // 3. Build the deterministic report. recommendClose = sentry noise/fixed + orphan/overflow plan
  //    issues (ready `gh issue close` command each). routeBug = real Sentry defects (issue link +
  //    /investigate). kept = still-open plan issues + "keep" sentry + untouched "other".
  const titleByNumber = new Map(openIssues.map((i) => [i.number, i.title]))
  const closeCmd = (n, reason) => `gh issue close ${n} --repo russellmoss/wine-inventory --comment "Closed by bug-triage issue sweep — ${String(reason).replace(/"/g, "'")}."`
  const recommendClose = []
  for (const v of sentryVerdicts) {
    if (v.disposition === 'real-bug' || v.disposition === 'keep') continue
    recommendClose.push({
      number: v.number, title: titleByNumber.get(v.number) || '', class: 'sentry',
      disposition: v.disposition, reason: v.reason, suggestFilter: v.suggestFilter === true,
      closeCommand: closeCmd(v.number, v.reason),
    })
  }
  for (const iss of orphanPlanIssues) {
    recommendClose.push({
      number: iss.number, title: iss.title, class: 'feedback-plan', disposition: 'orphan-plan',
      reason: 'plan issue has no linked ticket in the DB (deleted/unlinked) — likely stale', suggestFilter: false,
      closeCommand: closeCmd(iss.number, 'orphaned plan issue — no linked ticket'),
    })
  }
  for (const r of overflowReconcile) {
    recommendClose.push({
      number: r.number, title: r.title, class: 'feedback-plan', disposition: 'reconcile-overflow',
      reason: `source ticket ${r.ticket.ticketId} is ${r.ticket.status} (beyond the auto-close cap of ${MAX_ISSUE_CLOSES})`, suggestFilter: false,
      closeCommand: closeCmd(r.number, `source ticket ${r.ticket.status} — stale plan issue`),
    })
  }
  const routeBug = sentryVerdicts
    .filter((v) => v.disposition === 'real-bug')
    .map((v) => ({ number: v.number, title: titleByNumber.get(v.number) || '', reason: v.reason, action: `/investigate issue #${v.number}` }))
  const keptCount =
    planIssuesOpen.filter((i) => { const t = planByIssueNumber.get(i.number); return t && t.isOpen === true }).length +
    sentryVerdicts.filter((v) => v.disposition === 'keep').length +
    openIssues.filter((i) => i.issueClass === 'other').length

  issueSweep.reconcileClosed = issueCloseJobs.map((j) => ({ number: j.number, title: j.title, ticketId: j.ticketId, would: `close (ticket ${j.ticketStatus})` }))
  issueSweep.recommendClose = recommendClose
  issueSweep.routeBug = routeBug
  issueSweep.kept = keptCount
  log(`Issue sweep: ${issueCloseJobs.length} reconcile-close (auto), ${recommendClose.length} recommend-close, ${routeBug.length} route-as-bug, ${keptCount} kept.`)
}

// --- Act (dispatch + auto-merge + dismiss + plan-ready; fan out writes) ----
phase('Act')
let actions = { merged: [], dispatched: [], planRouted: [], dismissed: [], planReady: [], queued: actQueuedForHuman, errors: [], sweptMerged: [], issuesClosed: [], mergedPrReconciled: [] }
// Sweep-merge instructions the Act agent (or the dry-run report) consumes.
const sweepMergeJobs = sweptMergeCandidates.map((c) => {
  // Resolve the ticket this PR closes: prefer the in-window backlog (by PR # or by linked id),
  // else the DB lookup for an aged-out ticket. Only reconcile a ticket that is still OPEN — never
  // rewrite one already RESOLVED/DISMISSED.
  const inWindow = backlogByPrNumber.get(c.pr.number) || (c.review.linkedFeedbackId ? items.find((i) => i.id === c.review.linkedFeedbackId) : null)
  const looked = c.review.linkedFeedbackId ? linkedTicketById.get(c.review.linkedFeedbackId) : null
  const fb = inWindow
    ? { id: inWindow.id, sourceType: inWindow.sourceType, tenantId: inWindow.tenantId, source: 'in-window' }
    : (looked && looked.isOpen)
      ? { id: looked.id, sourceType: looked.sourceType, tenantId: looked.tenantId, source: 'aged-out (discovered)' }
      : null
  return {
    prNumber: c.pr.number, title: c.pr.title, isDraft: c.pr.isDraft, summary: c.review.summary,
    feedback: fb,
  }
})
if (DRY_RUN) {
  log('dryRun=true — reporting intended actions (incl. cluster fan-out, PR-sweep merges + already-shipped reconciliation) only, executing nothing.')
  actions = {
    merged: actMergeCandidates.map((c) => ({ id: c.item.id, prNumber: c.item.prNumber, type: c.item.type, triageClass: toTriageClass(c.item.type), would: 'auto-merge + set RESOLVED', fanOutResolve: dupsOf(c.item.id) })),
    dispatched: actDispatchCandidates.map((c) => ({ id: c.id, tenantId: c.tenantId, runId: c.awaitingRunId, type: c.type, triageClass: toTriageClass(c.type), would: 'approve+dispatch fix agent', fanOutLink: dupsOf(c.id) })),
    planRouted: actPlanRouteCandidates.map((c) => ({ id: c.id, tenantId: c.tenantId, type: c.type, triageClass: toTriageClass(c.type), would: 'persist PRODUCT_GAP + ensure/dispatch PLAN', fanOutLink: dupsOf(c.id) })),
    dismissed: actDismissCandidates.map((c) => ({ id: c.id, type: c.type, triageClass: toTriageClass(c.type), would: `DISMISS — ${c.rationale}`, fanOutDismiss: dupsOf(c.id) })),
    planReady: actPlanReadyCandidates.map((c) => ({
      id: c.id, type: c.type, triageClass: toTriageClass(c.type),
      would: isPlanStub(c.id)
        ? 'TRIAGED — plan issue is a STUB; needs /plan, NOT /work'
        : 'TRIAGED — plan ready for review (/work)',
      planStub: isPlanStub(c.id), rationale: c.rationale, fanOutLink: dupsOf(c.id),
    })),
    queued: actQueuedForHuman,
    errors: [],
    sweptMerged: sweepMergeJobs.map((j) => ({ prNumber: j.prNumber, title: j.title, would: `${j.isDraft ? 'un-draft + ' : ''}squash-merge${j.feedback ? ` + RESOLVE feedback ${j.feedback.id}` : ''}`, feedbackId: j.feedback?.id ?? null })),
    issuesClosed: issueCloseJobs.map((j) => ({ number: j.number, title: j.title, ticketId: j.ticketId, would: `close (reconcile — ticket ${j.ticketStatus})` })),
    mergedPrReconciled: mergedReconcileJobs.map((j) => ({ id: j.id, tenantId: j.tenantId, prNumber: j.prNumber, status: j.status, title: j.title, would: `RESOLVED — work already shipped in merged PR #${j.prNumber}`, fanOutResolve: j.fanOut })),
  }
} else {
  const acted = await agent(
    `You are the ACT agent (the goalie's hands) for a winery ERP. Execute EXACTLY the actions below and nothing else — no extra merges, no edits, no scope creep. Run from the repo root. After each successful merge/dismiss/plan-ready you MUST write the item's status back — AND fan the same write-back out to every duplicate in its cluster (the "fanOut" list) so one deployed solution closes every reporter. The queue must reflect reality.

EVERY status note you write must BEGIN with the item's disposition type in square brackets (each item below carries a "type" field), e.g. \`[product-gap] ...\` or \`[not-a-bug] ...\` — so the disposition survives in developerNotes and the next triage run can see how this was classified. ALSO: each item carries a "triageClass" field (the DB enum for its disposition, or null). When it is non-null, append \`--triage-class=<triageClass>\` to that item's \`triage:resolve\` command so the disposition is persisted STRUCTURALLY (queryable/filterable in /developer), not just in the note. If it is null, omit the flag.

OUTCOME NOTE CONTRACT — the note is the OUTCOME a human reads back in /developer, so it must say what actually happened, not just that something did. Keep it to ~2 lines (the store prepends + caps at 5000 chars across many entries), factual, no fluff:
  - If you FIXED it: state WHAT was done + HOW — name the root cause in a phrase and what the change/PR actually did. e.g. \`[defect] Fixed — off-by-one in the racking date picker; merged PR #123 (clamp to the vintage window).\`
  - If you did NOT fix it: state WHY not + what's NEEDED NEXT — the reason and the next action/owner. e.g. \`[product-gap] Not auto-fixed — no lot-level Brix field exists; needs a schema plan, routed to /plan.\`
  - For a MITIGATION (model-behavior): say it's a mitigation and may recur. e.g. \`[model-behavior] Mitigation only — added an eval golden + tool-scope rule; adherence is stochastic, may recur.\`
Write the SAME outcome (adjusted for the duplicate's relationship) when you fan out to a cluster duplicate. Fill every <placeholder> with the real value; never leave a literal \`<...>\` in a note.

A) AUTO-MERGE + RESOLVE these PRs (each passed the tight gate: fence-only, CI green, root-cause fix, merge-safe, small). For EACH:
   1. \`gh pr checks <prNumber>\` — confirm all required checks still PASS. \`gh pr view <prNumber> --json mergeable,isDraft\` — confirm mergeable == "MERGEABLE".
   2. If draft: \`gh pr ready <prNumber>\` first.
   3. \`gh pr merge <prNumber> --squash --delete-branch\`. NEVER --admin, never bypass branch protection. If refused (checks flipped, conflict, protection) DO NOT force — move it to "queued" with the reason and continue.
   4. On a successful merge, close the primary out with an OUTCOME note (what + how — read the PR you just merged and name the root cause + what the change did): \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=RESOLVED --note="[<type>] Fixed — <root cause in a phrase>; merged PR #<prNumber> (<what the change did>)."\`
   5. FAN OUT: for EACH duplicate in this primary's fanOut list, run \`npm run triage:resolve -- --tenant=<dup.tenantId> --source=<dup.sourceType> --id=<dup.id> --status=RESOLVED --note="[<type>] Fixed — same root cause as <primaryId>; merged PR #<prNumber> (<what the change did>)."\`
   PRs: ${JSON.stringify(actMergeCandidates.map((c) => ({ id: c.item.id, sourceType: c.item.sourceType, tenantId: c.item.tenantId, prNumber: c.item.prNumber, title: c.item.title, type: c.item.type, triageClass: toTriageClass(c.item.type), fanOut: dupsOf(c.item.id) })), null, 2)}

B) DISPATCH these NEW bugs to the fix agent (approve+dispatch the AWAITING_APPROVAL run — the /developer Approve button):
   For EACH: \`npm run triage:dispatch -- --tenant=<tenantId> --run=<awaitingRunId>\`. Report the JSON. If it prints ok:false, record under "errors" and continue (no retry loop). On ok:true, mark the primary IN_PROGRESS (skip for ASSISTANT_FEEDBACK, which has no such state) with an OUTCOME note naming the root cause the fix agent is targeting: \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=IN_PROGRESS --note="[<type>] Fix dispatched — <root cause in a phrase>; fix agent running in-fence, PR to follow."\` Then FAN OUT: for EACH duplicate in fanOut, \`npm run triage:resolve -- --tenant=<dup.tenantId> --source=<dup.sourceType> --id=<dup.id> --status=TRIAGED --note="[<type>] Linked to dispatched fix for <primaryId> — same root cause; one PR will close this."\`
   Runs: ${JSON.stringify(actDispatchCandidates.map((c) => ({ id: c.id, sourceType: c.sourceType, tenantId: c.tenantId, runId: c.awaitingRunId, title: c.title, type: c.type, triageClass: toTriageClass(c.type), fanOut: dupsOf(c.id) })), null, 2)}

C) ROUTE PRODUCT GAPS to the existing PLAN workflow, never the fix agent. For EACH:
   1. Persist the disposition first: \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=TRIAGED --triage-class=PRODUCT_GAP --note="[product-gap] Routed to plan automation — <the gap, one phrase>; PLAN generation requested."\`
   2. Run \`npm run triage:plan -- --tenant=<tenantId> --source=<sourceType> --id=<id>\`. On ok:true, record under planRouted. On ok:false, record under errors + queued; do not fall back to \`triage:dispatch\`. The command will skip an awaiting wrong-kind fix, but refuses a queued/running/PR-open fix and persists the conflict.
   3. FAN OUT only the outcome, not another PLAN run: for EACH duplicate, \`npm run triage:resolve -- --tenant=<dup.tenantId> --source=<dup.sourceType> --id=<dup.id> --status=TRIAGED --triage-class=PRODUCT_GAP --note="[product-gap] Linked to PLAN routing for <primaryId> — same product gap; one plan will cover this cluster."\`
   Items: ${JSON.stringify(actPlanRouteCandidates.map((c) => ({ id: c.id, sourceType: c.sourceType, tenantId: c.tenantId, title: c.title, type: c.type, triageClass: toTriageClass(c.type), rationale: c.rationale, fanOut: dupsOf(c.id) })), null, 2)}

D) PLAN-READY — these already have a PLAN (plan-mode), not code. Do NOT dispatch or merge. Each item carries a \`planStub\` boolean; it decides which note you write:
   - planStub === false — the plan issue holds a REAL plan, so the next step is to build it: \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=TRIAGED --note="[<type>] Not auto-fixed (needs a plan) — <the gap, one phrase>; plan ready at <planUrl>, run /work."\` (use the item's planUrl; if none, write "see planMarkdown" instead of a url).
   - planStub === true — the linked "plan" issue is an EMPTY TEMPLATE STUB (the plan automation opened it from boilerplate: "Plan only; no code changes", "Review the linked app feedback item in the developer console"). There is NOTHING to build, so do NOT tell anyone to /work it. Write instead: \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=TRIAGED --note="[<type>] Not auto-fixed — the linked plan issue (<planUrl>) is an empty template with no plan in it; needs a real /plan pass before any build."\` The item's \`planStubReason\` says why it was judged a stub — you may use its wording, but keep the note to ~2 lines.
   FAN OUT to duplicates with status TRIAGED and the same note (matching the item's planStub branch).
   Items: ${JSON.stringify(actPlanReadyCandidates.map((c) => ({ id: c.id, sourceType: c.sourceType, tenantId: c.tenantId, title: c.title, type: c.type, triageClass: toTriageClass(c.type), planUrl: (itemById.get(c.id)?.githubIssueUrl) ?? null, planStub: isPlanStub(c.id), planStubReason: planStubById.get(c.id)?.reason ?? null, fanOut: dupsOf(c.id) })), null, 2)}

E) DISMISS these non-bugs (write status back so they leave the queue):
   For EACH, write an OUTCOME note stating WHY it's not a bug (works-as-designed / user-error / empty-state / permissions) so the reporter understands: \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=DISMISSED --note="[<type>] Not a bug — <why, one line>; no code change warranted."\`. FAN OUT: only dismiss a duplicate too when it is truly the SAME root cause — same note. If unsure about a duplicate, leave it and note that in errors.
   Items: ${JSON.stringify(actDismissCandidates.map((c) => ({ id: c.id, sourceType: c.sourceType, tenantId: c.tenantId, title: c.title, type: c.type, triageClass: toTriageClass(c.type), why: c.rationale, fanOut: dupsOf(c.id) })), null, 2)}

F) QUEUE for a human — do NOT act, but record the OUTCOME so it's clearly triaged (not silently NEW): the verdict (why it wasn't auto-fixed) + what a human should do next. For EACH (primary only — do NOT write its duplicates):
   \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=TRIAGED --note="[<type>] Handed to a human — <verdict, one line>; <next step: /investigate | /plan | review PR #N | deeper issue named>."\`
   Items: ${JSON.stringify(actQueuedForHuman.map((q) => ({ id: q.id, sourceType: q.sourceType, tenantId: q.tenantId, title: q.title, type: q.type, triageClass: q.triageClass, verdict: q.verdict })), null, 2)}

G) SWEEP-MERGE these orphan open PRs (each cleared the SAME tight gate as A — complete, fence-only, CI green, root/docs/chore, merge-safe, small, ERP-standards ok, mergeable). These were NOT tied to an active feedback item's review; the sweep found them. For EACH:
   1. \`gh pr checks <prNumber>\` — confirm required checks still PASS. \`gh pr view <prNumber> --json mergeable,isDraft\` — confirm mergeable == "MERGEABLE". If it reads "UNKNOWN" (GitHub recomputes lazily after main moves), wait a few seconds and re-run the view ONCE; if it is still not "MERGEABLE" (UNKNOWN or CONFLICTING), DO NOT merge — record under "errors" ("mergeability unresolved / conflict") and continue. Only a confirmed "MERGEABLE" proceeds.
   2. If isDraft is true: \`gh pr ready <prNumber>\` first (the sweep un-drafts a FINISHED draft before merging — that is the whole point of clearing built-but-unresolved PRs).
   3. \`gh pr merge <prNumber> --squash --delete-branch\`. NEVER --admin, never bypass branch protection. If refused (checks flipped, conflict, protection), DO NOT force — record it under "errors" with the reason and continue.
   4. If the job carries a "feedback" object (the PR resolves a tracked feedback item), close that item out too: \`npm run triage:resolve -- --tenant=<feedback.tenantId> --source=<feedback.sourceType> --id=<feedback.id> --status=RESOLVED --note="[defect] Fixed — merged PR #<prNumber> (<what the change did>); closed via PR sweep."\` (skip the IN_PROGRESS step; go straight to RESOLVED).
   Record each under "sweptMerged": { prNumber, url, feedbackResolved (id or null) }. DO NOT close/merge anything not listed here, and NEVER close a PR (close is recommend-only, handled outside this agent).
   PRs: ${JSON.stringify(sweepMergeJobs, null, 2)}

H) RECONCILE-CLOSE these stale "feedback: plan" GitHub ISSUES. Each maps to a source feedback ticket that is ALREADY RESOLVED/DISMISSED (proven from DB truth), so the plan issue is stale and must be closed to stop the issue backlog from lying. This is a MECHANICAL close on provable reconciliation — the ONLY class of issue this agent closes. For EACH:
   \`gh issue close <number> --repo russellmoss/wine-inventory --comment "Closed by bug-triage issue sweep — <reason>."\` (use the job's "reason"). Record each under "issuesClosed": { number, ticketId }. If a close is refused, record it under "errors" and continue. Do NOT close any issue not listed here — Sentry/other closes are recommend-only and handled by the operator, NOT this agent.
   ISSUES: ${JSON.stringify(issueCloseJobs, null, 2)}

I) RECONCILE ALREADY-SHIPPED TICKETS. Each of these is a feedback item that is STILL OPEN in the database even though its work ALREADY SHIPPED in a pull request that MERGED before this run — a PR built by hand, so nothing ever stamped it onto the ticket. The workflow already proved every one of these from DB truth (\`triage:lookup\` says the ticket exists and is still open) and from git (the PR is merged), so this is a MECHANICAL close, exactly like the intake reconcile. There is NO code to write and NO PR to merge here — do NOT open, build, merge, or dispatch anything for these. Just close them out. For EACH:
   \`npm run triage:resolve -- --tenant=<tenantId> --source=<sourceType> --id=<id> --status=RESOLVED --triage-class=<triageClass> --note="[<type>] Fixed — already shipped in merged PR #<prNumber> (<what that PR actually did, one phrase>); reconciled to RESOLVED, no new work needed."\`
   Read the PR first (\`gh pr view <prNumber> --json title,body\`) so "<what that PR actually did>" is real and specific — this note is the only record a human gets of why the ticket closed without anyone working it. Include the merge commit sha from the job when there is one.
   Then FAN OUT to every duplicate in the job's fanOut list with the SAME status and an equivalent note: \`... --note="[<type>] Fixed — same root cause as <primaryId>; already shipped in merged PR #<prNumber>; reconciled to RESOLVED."\`
   Record each under "mergedPrReconciled": { id, prNumber, ok, fannedOut }. If a resolve is refused, record it under "errors" and continue.
   TICKETS: ${JSON.stringify(mergedReconcileJobs.map((j) => ({ id: j.id, sourceType: j.sourceType, tenantId: j.tenantId, title: j.title, status: j.status, type: j.type, triageClass: j.triageClass, prNumber: j.prNumber, prUrl: j.prUrl, prTitle: j.prTitle, mergedAt: j.mergedAt, mergeCommit: j.mergeCommit, evidence: j.evidence, fanOut: j.fanOut })), null, 2)}

Report truthfully what you actually did: merged (PR url + fanned-out ids), dispatched fixes (run result + fanned-out ids), planRouted (PLAN run result + fanned-out ids), planReady (ids + plan link), dismissed (ids), queued, sweptMerged (PR urls + any feedback ids resolved), issuesClosed (issue numbers), mergedPrReconciled (already-shipped ids + the PR that shipped them), errors. A merge, PLAN route, issue close, or reconcile that was refused goes in errors, not in a success list.`,
    { label: 'act', phase: 'Act', schema: ACTION_SCHEMA },
  )
  if (acted) actions = acted
}

// --- Parallelize (build-conflict analysis → runbook) ----------------------
// ALWAYS runs (read-only) — even a dryRun should emit the plan of attack + parallel build
// waves, since that IS the value of a dry skate. Produces TRIAGE-RUNBOOK.md content.
phase('Parallelize')
const outcomeById = {}
for (const m of (actions.merged || [])) outcomeById[m.id] = 'merged'
for (const d of (actions.dispatched || [])) outcomeById[d.id] = 'fix-dispatched'
for (const r of (actions.planRouted || [])) outcomeById[r.id] = 'plan-routed'
for (const p of (actions.planReady || [])) outcomeById[p.id] = 'plan-ready'
for (const e of (actions.errors || [])) outcomeById[e.id] = 'errored'
for (const q of (actions.queued || [])) outcomeById[q.id] = 'queued'
// LAST, so it wins over any ranked outcome above: the work is in production. Nothing may build it.
for (const id of mergedReconciledIds) outcomeById[id] = 'already-shipped'

const buildInput = ranked.map((x) => ({
  id: x.id, title: x.title, priority: x.priority, type: x.type, bucket: x.bucket,
  effort: x.effort, planUrl: itemById.get(x.id)?.githubIssueUrl ?? null,
  // planStub: the planUrl points at an empty automation template, NOT a plan. Such an item is
  // "plan-ready" in name only — there is nothing at that url to build.
  planStub: isPlanStub(x.id), planStubReason: planStubById.get(x.id)?.reason ?? null,
  outcome: outcomeById[x.id] || 'ranked', rationale: x.rationale,
  // ERP-standards verdict on the requested change: conflict items are held OUT of every build
  // wave (they need a human redesign first); caution items build but with the standard named.
  erpStandards: erpConflict(x) ? 'conflict' : (x.erpStandards?.conformance || 'ok'),
  erpConcern: x.erpStandards?.concern || reviewById.get(x.id)?.erpConcern || null,
}))

log(`Planning parallel build waves across ${buildInput.length} ranked item(s).`)
const buildPlan = buildInput.length === 0
  ? { waves: [], planFirst: [], investigateFirst: [], erpReview: [], notes: 'No buildable items this run.' }
  : await agent(
  `You are the BUILD PLANNER for a winery ERP bug backlog. Triage is done; produce a PARALLEL BUILD PLAN so a FLEET of Claude Code instances can clear the actionable work as fast as possible WITHOUT stepping on each other — no two concurrent builds may touch the same files.

${FENCE}

INPUT — the ranked backlog, each item tagged with its disposition type, bucket, priority, plan link, and what already happened to it THIS run ("outcome"):
${JSON.stringify(buildInput, null, 2)}

Do this:
1. SELECT the items a human/agent must now write code for ("buildable"):
   - plan-ready (outcome "plan-ready" OR bucket "plan-ready") **with planStub === false**: a REAL plan exists at planUrl → the action is \`/work <planUrl>\`.
   - a defect whose dispatch ERRORED (outcome "errored"), or a defect/model-behavior queued needs-human that is IN-FENCE → action \`/investigate then /work\`.
   EXCLUDE from waves: outcome "merged" (done), outcome "already-shipped" (the work is ALREADY IN PRODUCTION — it shipped in a PR that merged before this run and the ticket was just reconciled; never build it, never list it anywhere in this plan), outcome "fix-dispatched" (an agent is already building it — never open a second build), product-gaps with NO plan yet (→ put them in planFirst, they need /plan before they can be built), any item with **planStub === true** (see below), AND any item with erpStandards=="conflict" (→ put it in erpReview, NOT a wave — see step 6).
   PLAN STUBS: an item with planStub === true is "plan-ready" in NAME ONLY — its planUrl points at the plan automation's EMPTY BOILERPLATE issue ("Plan only; no code changes", "Review the linked app feedback item in the developer console"), not at a plan. There is nothing there to build, so it must NEVER get a \`/work <planUrl>\` task. Put it in planFirst with action \`/plan\` and say the linked issue is an empty stub.
2. For each buildable item, estimate the DOMAINS/files it will most likely touch (use the fence domain list + your judgment; include \`prisma/schema.prisma\` when a schema change is likely).
3. CONFLICT RULE: two items CONFLICT if their likely file/domain sets OVERLAP (same module, or same schema table) OR one dependsOn the other's change. Non-overlapping, dependency-free items are PARALLEL-SAFE.
4. Group into WAVES. A wave = a MAXIMAL set of mutually non-overlapping, dependency-satisfied items — all buildable CONCURRENTLY, each in its own Claude Code instance on its own branch+PR, with no merge conflict. Put conflicting or dependent items in LATER waves (record dependsOn). Maximize parallelism (as many disjoint items per wave as is safe). Place P0/P1 in the earliest wave they can safely occupy. Set parallelSafe=true only when a wave's tasks are genuinely disjoint, with a one-line rationale (which domains are disjoint, or what shared file / dependency forced sequencing). For any wave item carrying erpStandards=="caution", append the standard-to-uphold (its erpConcern) to the task action so the builder keeps it conformant.
5. planFirst = product-gaps needing /plan first, PLUS every planStub item (its "plan" is an empty template — it needs a real /plan pass before it is buildable); investigateFirst = unclear items needing /investigate.
6. erpReview = EVERY item with erpStandards=="conflict". These are NEVER placed in a wave, planFirst, or investigateFirst — the requested change would break a system-of-record standard, so a human must first redesign the ask into a conformant shape (a CORRECTION event instead of an in-place edit/delete, a SUPERSEDE instead of mutating a posted record, the accounting OUTBOX instead of a direct external write, a TENANT-SCOPED path instead of a widened query). Record the concern (the standard it breaks) and the conformant redesign as the action. This is the headline the operator asked for: "which of these, if built as asked, would push the ERP off-standard."

BE CONSERVATIVE: if unsure two items are disjoint, SEQUENCE them — a false "parallel-safe" causes a real merge conflict. Return the structured plan.`,
  { label: 'build-planner', phase: 'Parallelize', schema: BUILD_PLAN_SCHEMA },
)

// DETERMINISTIC BACKSTOP on the planner. Two classes must never reach a build wave, and "the prompt
// said so" is not an enforcement mechanism — the whole defect this run fixes was a shipped ticket
// being handed to a builder. So strip them in JS:
//   - already-shipped: the work is in production. Drop the task outright.
//   - plan stubs: the planUrl is the empty automation template. Move the task to planFirst with a
//     /plan action, never `/work <planUrl>` — a builder sent to that url finds boilerplate.
const enforceBuildPlan = (bp) => {
  const plan = bp || { waves: [] }
  const planFirst = [...(plan.planFirst || [])]
  const seenPlanFirst = new Set(planFirst.map((p) => p.id))
  const droppedShipped = []
  const rerouted = []
  const waves = (plan.waves || []).map((w) => {
    const tasks = []
    for (const t of (w.tasks || [])) {
      if (mergedReconciledIds.has(t.id)) { droppedShipped.push(t.id); continue }
      if (isPlanStub(t.id)) {
        rerouted.push(t.id)
        if (!seenPlanFirst.has(t.id)) {
          seenPlanFirst.add(t.id)
          planFirst.push({ id: t.id, title: t.title, action: `/plan — the linked issue (${planStubById.get(t.id)?.url || 'plan issue'}) is an empty template stub, there is no plan to build` })
        }
        continue
      }
      tasks.push(t)
    }
    return { ...w, tasks }
  }).filter((w) => (w.tasks || []).length > 0)
  // A stub the planner already parked in planFirst still needs the honest action text.
  for (const p of planFirst) {
    if (isPlanStub(p.id) && !/empty template|stub/i.test(p.action || '')) {
      p.action = `/plan — the linked issue (${planStubById.get(p.id)?.url || 'plan issue'}) is an empty template stub, there is no plan to build`
    }
  }
  if (droppedShipped.length) log(`Build plan: dropped ${droppedShipped.length} already-shipped task(s) the planner still listed (${droppedShipped.join(', ')}).`)
  if (rerouted.length) log(`Build plan: rerouted ${rerouted.length} stub-plan task(s) from /work to /plan (${rerouted.join(', ')}).`)
  return {
    ...plan, waves,
    planFirst,
    // Renumber so the runbook never shows a gap where a wave was emptied out.
    ...(waves.length ? { waves: waves.map((w, i) => ({ ...w, wave: i + 1 })) } : {}),
  }
}
const finalBuildPlan = enforceBuildPlan(buildPlan)

// PR-sweep report (deterministic, JS-built) — merged / recommend-close / fix-first / needs-human,
// each with the ready gh command so a human can clear it in one paste.
const sweepReport = {
  scanned: orphanPrs.length,
  merged: (actions.sweptMerged || []),
  closeRecommend: sweptCloseRecommend.map((r) => ({
    prNumber: r.prNumber, title: r.title, reason: r.closeReason || 'superseded/duplicate/stale',
    supersededByPr: r.supersededByPr ?? null,
    closeCommand: `gh pr close ${r.prNumber} --comment "Closed by bug-triage PR sweep — ${(r.closeReason || 'superseded/duplicate/stale').replace(/"/g, "'")}."`,
  })),
  fixFirst: sweptFixFirst.map((r) => ({ prNumber: r.prNumber, title: r.title, why: r.recommendation, action: `/investigate PR #${r.prNumber} (CI failing or branch conflicts) then push a fix` })),
  needsHuman: sweptNeedsHuman.map((r) => ({
    prNumber: r.prNumber, title: r.title, assessment: r.assessment,
    erp: r.erpStandards, why: r.recommendation,
    mergeCommand: `gh pr merge ${r.prNumber} --squash --delete-branch`,
  })),
  // Aged-out tickets the sweep DISCOVERED (intake never surfaced them) and reconciled via a merge.
  linkedReconciled: sweepMergeJobs
    .filter((j) => j.feedback && j.feedback.source === 'aged-out (discovered)')
    .map((j) => ({ prNumber: j.prNumber, ticketId: j.feedback.id, tenantId: j.feedback.tenantId })),
  // MERGED sweep — tickets whose work had ALREADY SHIPPED in a PR merged before this run (the
  // hand-built-PR blind spot). Sits alongside linkedReconciled: same idea, different discovery
  // path (that one comes off a PR this run merged; this one off git history).
  mergedScanned: mergedScan.scanned,
  mergedSince: MERGED_SINCE,
  mergedReconciled: mergedReconcileJobs.map((j) => {
    const done = (actions.mergedPrReconciled || []).find((r) => r.id === j.id)
    return {
      id: j.id, tenantId: j.tenantId, title: j.title, prNumber: j.prNumber, prUrl: j.prUrl,
      prTitle: j.prTitle, mergedAt: j.mergedAt, mergeCommit: j.mergeCommit, evidence: j.evidence,
      wasStatus: j.status, inWindow: j.inWindow, duplicates: (j.fanOut || []).length,
      applied: DRY_RUN ? false : (done ? done.ok !== false : false),
    }
  }),
  // Candidate ids the sweep found but deliberately did NOT write (not a real ticket, already
  // closed, or past the cap). Surfaced so a silently-dropped id is never invisible.
  mergedSkipped: mergedScan.skipped,
  // Ranked items this run pulled OUT of its own action list because they turned out to be shipped.
  supersededByShipped,
}

const runbook = renderRunbook({
  planSummary: plan?.summary, byType, buildPlan: finalBuildPlan || { waves: [] },
  inFlight, actions, dateStr: RUNBOOK_DATE, erpFlags: erpStandardsFlags, sweep: sweepReport,
  issueSweep,
})

// --- Report ---------------------------------------------------------------
phase('Report')
return {
  status: DRY_RUN ? 'dry-run' : 'done',
  mode: { dryRun: DRY_RUN, autoMerge: AUTO_MERGE, dispatch: DISPATCH, reconcile: RECONCILE, cluster: CLUSTER, argsWarning },
  runbook,
  runbookPath: 'TRIAGE-RUNBOOK.md',
  buildPlan: finalBuildPlan || { waves: [] },
  planSummary: plan?.summary,
  byType,
  counts: {
    backlog: items.length,
    active: active.length,
    clustersFormed: clusters.length,
    duplicatesLinked: duplicateCount,
    planReady: plannedItems.length,
    skipped: skippedItems.length,
    reconciled: reconciled.length,
    inFlight: inFlight.length,
    alreadyClosed: dbClosed.length,
    reviewed: reviews.length,
    merged: actions.merged?.length || 0,
    dispatched: actions.dispatched?.length || 0,
    planRouted: actions.planRouted?.length || 0,
    dismissed: actions.dismissed?.length || 0,
    planReadyActed: actions.planReady?.length || 0,
    queuedForHuman: actions.queued?.length || 0,
    errors: actions.errors?.length || 0,
    erpConflicts: erpStandardsFlags.filter((f) => f.level === 'conflict').length,
    erpCautions: erpStandardsFlags.filter((f) => f.level === 'caution').length,
    prsScanned: orphanPrs.length,
    prsSweptMerged: sweepReport.merged.length,
    prsCloseRecommend: sweepReport.closeRecommend.length,
    prsFixFirst: sweepReport.fixFirst.length,
    prsNeedsHuman: sweepReport.needsHuman.length,
    prsLinkedTicketsReconciled: sweepReport.linkedReconciled.length,
    // MERGED sweep — the already-shipped blind spot. `alreadyShippedReconciled` is the headline:
    // tickets that were still lying open while their fix sat in production.
    mergedPrsScanned: sweepReport.mergedScanned,
    alreadyShippedReconciled: sweepReport.mergedReconciled.length,
    alreadyShippedSkipped: sweepReport.mergedSkipped.length,
    rankedItemsSupersededByShipped: supersededByShipped.length,
    planStubsRerouted: planStubById.size,
    issuesScanned: issueSweep.scanned,
    issuesReconcileClosed: (actions.issuesClosed?.length || issueSweep.reconcileClosed?.length || 0),
    issuesRecommendClose: issueSweep.recommendClose?.length || 0,
    issuesRouteBug: issueSweep.routeBug?.length || 0,
    issuesKept: issueSweep.kept || 0,
  },
  // PR sweep: every open PR triaged (not just feedback-linked). merged = auto-landed gate-passers;
  // closeRecommend = superseded/duplicate/stale (human confirms the close); fixFirst = failing/
  // conflicting; needsHuman = out-of-fence / large / real feature. Each carries a ready gh command.
  // ALSO carries the MERGED sweep (mergedReconciled / mergedSkipped / supersededByShipped): tickets
  // still open while their fix was already in production, found by scanning recently-merged PR
  // bodies for a feedback id. This is the "triage re-offered shipped code as new work" answer.
  sweep: sweepReport,
  // Issue sweep: every open GitHub issue triaged. reconcileClosed = stale plan issues auto-closed on
  // DB truth (ticket already RESOLVED/DISMISSED); recommendClose = Sentry noise / stale (operator
  // confirms — never auto-closed); routeBug = genuine Sentry defects for /investigate; kept = still
  // tracked. This is the "issues are piling up — deal with them" answer.
  issueSweep,
  // ERP-standards pass: items whose requested change (or PR diff) strains/breaks a system-of-record
  // standard. Conflicts are blocked from all automation + build waves; cautions build with the
  // named standard to uphold. This is the "did we keep it standard for an ERP" report-back.
  erpStandardsFlags,
  reconciled,
  inFlight: inFlight.map((i) => ({ id: i.id, title: i.title, automationStatus: i.automationStatus, activeRun: i.activeRun ?? null, automationConflict: i.automationConflict ?? null })),
  clusters: clusters.filter((c) => c.size > 1).map((c) => ({ primaryId: c.primaryId, rootCause: c.rootCause, tenantCount: c.tenantCount, size: c.size, memberIds: c.memberIds })),
  // planStub=true means the planUrl is the plan automation's empty template, NOT a plan — the item
  // is plan-ready in name only and was routed to /plan rather than handed to a builder as /work.
  planReady: plannedItems.map((i) => ({ id: i.id, tenantId: i.tenantId, title: i.title, planUrl: i.githubIssueUrl ?? null, planStub: isPlanStub(i.id), planStubReason: planStubById.get(i.id)?.reason ?? null, planSnippet: (i.planMarkdown || '').slice(0, 400) || null })),
  skipped: skippedItems.map((i) => ({ id: i.id, tenantId: i.tenantId, title: i.title, reason: (i.developerNotes || '').slice(0, 400) || null })),
  ranked,
  reviews,
  actions,
}
