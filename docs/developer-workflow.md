# Developer workflow: Wine Inventory, Linear, and GitHub

This is the operating runbook for the two-developer pilot. Wine Inventory owns private
feedback and outcomes, Linear owns human delivery planning, and GitHub owns code delivery.
The boundary is intentional. Do not copy a status or assignee into all three systems.

No Linear API key, OAuth app, webhook, or application environment variable is required.
The first release is a manual, reviewed handoff.

## Where does this update go?

| Update | Source of truth | Do not duplicate in |
|---|---|---|
| Original report, tenant, actor, debug context, screenshots, automation history | Wine Inventory `/developer` | Linear or GitHub descriptions |
| Reporter-visible resolution or dismissal outcome | Wine Inventory `/developer` | A Linear-only comment |
| Human assignee, priority, project, cycle, and delivery status | Linear | Wine Inventory fields or GitHub labels |
| Branch, commits, checks, review, pull request, and merge | GitHub | Wine Inventory status fields |
| Generated plan/fix-agent run and its artifact links | Wine Inventory `AutomationRun` + GitHub Actions | A second Linear automation |

Private evidence never crosses the Wine Inventory boundary. A Linear issue receives only
the reviewed, bounded **Copy Linear handoff** packet and the authenticated source-item link.

## One-time setup

### 1. Create or promote the second developer

1. Sign in as an existing global developer.
2. Open `/users` while in Demo Winery.
3. Create the new user with role **Developer**, or promote an existing user to Developer.
4. Give the temporary password to that developer through the team's approved secret-sharing
   channel. Require the password change at first sign-in.
5. Confirm the account can sign in, open `/developer`, and see Demo Winery. The shipped role
   flow creates or repairs the Demo Winery membership for a new or promoted developer.
6. Do not send `.env`, Neon URLs, Vercel secrets, owner credentials, production database
   credentials, support tokens, or raw ticket attachments.

The `npm run seed:developer` script remains break-glass recovery for the original developer.
It is not the normal onboarding path for developer 2.

### 2. Grant GitHub access

1. Invite the developer to `russellmoss/wine-inventory` with the least repository role that
   permits branches and pull requests.
2. Keep the protected `main` branch rules enabled. At minimum, require the repository checks
   and pull-request review before merge. Never bypass protection with `--admin`.
3. Confirm the developer can create a `codex/` or feature branch, push it, and open a draft PR.
4. Never give a developer production database credentials merely to run or review a PR.

### 3. Create the Linear Free pilot

Create one workspace with one team:

- Team name: **Wine Inventory**
- Team identifier: **WIN**
- Workflow: Triage → Backlog → Ready → In Progress → In Review → Done, plus Canceled
- Labels: `defect`, `assistant-model`, `product-gap`, `security-review`, `P0`, `P1`, `P2`
- Templates: Bug, Product gap, Assistant/model behavior
- Required template fields: `Wine source:` and `Acceptance criteria:`

Invite only the two trusted developers. Linear Free makes every workspace member an admin and
does not provide private teams. A contractor, customer, general staff member, or third developer
invite is therefore a permission-and-plan review event, not a casual invitation.

Connect the GitHub repository for branch/commit/PR linking and PR-driven Linear status updates.
Leave **GitHub Issues Sync disabled**. The Wine Inventory automation already creates some GitHub
issues; enabling issue sync would create a second delivery item for the same work.

## Daily intake and delivery loop

1. Open `/developer`. Inbox is the default view.
2. Review failures and PLAN/FIX conflicts first, then P0 and awaiting-approval work.
3. Classify the item. Wine Inventory derives Inbox, Ready, Tracked, or Closed; do not create a
   second workflow status to mimic Linear.
4. For safe automated work, start the explicitly named **plan** or **fix** route. Product gaps go
   through PLAN only; eligible defects go through AGENTIC_FIX only.
5. For accepted human work, select **Copy Linear handoff**, review it for secrets or personal data,
   and paste it into the correct Linear template.
6. Create the Linear issue, paste its exact `https://linear.app/.../issue/WIN-###/...` URL into
   **Mark as tracked**, and confirm any deliberate shared-issue or replacement warning.
7. Claim, prioritize, and schedule the work in Linear only.
8. Name the branch with the Linear identifier, for example `codex/WIN-42-fix-cellar-sync`.
9. Put `WIN-42` and the Wine source marker (`FEEDBACK_TICKET:<id>` or
   `ASSISTANT_FEEDBACK:<id>`) in the PR title or body. Do not put auth tokens or private evidence
   in the branch, commit, PR, or Linear issue.
10. Use the authenticated Wine source link and temporary support context when private evidence is
    needed. Do not download and re-upload a screenshot to Linear.

When multiple feedback reports describe one root cause, they may deliberately point to the same
Linear issue. `/developer` warns with the current-tenant count before saving that fan-in.

## Definition of Done

Work is done only when all applicable boxes are true:

- [ ] The change is merged, or the work is deliberately declined.
- [ ] GitHub required checks and review passed; GitHub records the merge truth.
- [ ] The Linear issue is Done or Canceled with its final human delivery status.
- [ ] The Wine Inventory item is Resolved or Dismissed.
- [ ] The Wine Inventory outcome is at least 20 characters and useful to the reporter.
- [ ] Private evidence remains in Wine Inventory.

If automation already wrote the app outcome after its PR merged, verify it instead of writing a
duplicate. Otherwise close the item manually from the Outcome section.

## Demo Winery QA

Use `org_demo_winery` for every local, browser, and fake-data check. Never create QA rows in Bhutan
Wine Co. Enter Demo Winery support context only when testing tenant routes or private attachments,
then exit support context when the check is complete.

The normal developer does not need production `.env` or database access. A maintainer with the
owner environment runs DB migrations and DB-backed verification. The developer can run pure tests,
lint, build, browser QA against their permitted environment, and GitHub PR checks.

## `/bug-triage` compatibility

The installed `/bug-triage` workflow must consume repository payload **contractVersion 2** from
`npm run triage:list`. The minimum compatible repository commit is
`d2b504f90616faaa06753632e2a8f3f7c0d6aecf` (Plan 067 PR A).

Contract rules:

- read both `awaitingRunId` and `awaitingRunKind`;
- dispatch an awaiting run only when its kind matches the intended PLAN or AGENTIC_FIX route;
- route PRODUCT_GAP through `npm run triage:plan -- --tenant=<tenantId>
  --source=<FEEDBACK_TICKET|ASSISTANT_FEEDBACK> --id=<sourceId>`;
- never pass PRODUCT_GAP to `triage:dispatch`;
- never describe an awaiting PLAN as a fix;
- surface a queued/running wrong-kind fix as a human conflict instead of canceling it.

If `triage:list` returns another contract version, stop the local workflow and update its consumer
before dispatching anything.

## 30-day pilot review

Record these once per week and decide after 30 days:

- actionable reports promoted;
- duplicate-work incidents;
- Linear-closed items left open in Wine Inventory;
- minutes per week spent copying, linking, and reconciling;
- Linear issue count and team count;
- whether anyone outside the trusted developer pair needs access.

Stay Free/manual while the workspace remains under about 200 issues, at two or fewer teams, only
trusted developers need access, and reconciliation stays under about 15 minutes per week. Upgrade
when the 250-issue limit, more teams, or admin-role needs are real. Evaluate Business, not Basic,
when private teams or guests are required. Plan an API integration only when promotion exceeds about
10 items per week or repeated status drift makes the manual boundary the bottleneck.
