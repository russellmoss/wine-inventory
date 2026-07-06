# Incumbent Teardown — Configuration & Setup

> **Agent 4 of 7.** How do wineries *configure* each system — templates, catalogs, policies,
> units, naming/auto-codes, permissions/roles, and integrations — and where does configurability
> live in vintrace vs InnoVint vs **Cellarhand today**? Every Cellarhand claim is tagged
> **[IMPLEMENTED] / [PLANNED] / [ABSENT]** per `analysis/CELLARHAND-CURRENT-STATE.md`. Incumbent
> claims cite `vintrace:` / `innovint:` doc paths. Method: describe each incumbent, converge/diverge,
> then recommend (labeled subsection at the end). This doc does not edit planning docs.

---

## 1. vintrace configuration model — a deep, admin-driven "Winery Setup" console

vintrace's philosophy is a **tile-based `Set Up` console**: sidebar → domain tile → `Configure`. Nearly
everything is self-service by a **"Local vintrace Administrator"**, with a small vendor-gated tail (tank
controllers, POS, subscription seats, company logo). Three structural pillars:

**(a) A flat ~50-permission capability list — not RBAC.** Authorization is a large flat set of
individually-toggleable permissions (`vintrace:setup-and-admin/configuration/roles-and-permissions.md`,
~50 permissions across lines 40–311). "Roles" (Lab technician, Operator/Owner, Winemaker; org roles
Carrier/Cooper/Grower/Laboratory/Vendor…) are **categorization only** — "Roles do NOT control what the
system user is able to do" (`roles-and-permissions.md:38`). The real authorization is the permission list,
and it is strikingly fine-grained on the compliance/cost surface: `Can View Costs` vs `Can Adjust Costs`
vs `Can Add Costs on Receival`; `Can Adjust Tax State` vs `Can Edit Tax Volume Events` vs `Can Adjust Live
Bond Details` vs `Can Close Off a TTB702 Period and Backdate Into a Closed-Off Period` vs `Can Move Wine
Between Bonds`. New users auto-get 14 default-on permissions; cost/tax/admin are opt-in
(`roles-and-permissions.md:294-311`).

**(b) Two parallel user-management systems — a migration mid-flight.** Non-SSO wineries create "System
Users" as **Address Book contacts with an admin-set password**, ticking raw permissions
(`vintrace:setup-and-admin/configuration/managing-system-users.md:43`). SSO/central-auth wineries get a
**modern email-invite flow with Active/Disabled/Pending lifecycle and four named role *bundles*** —
Administrator / Cellarhand / Reporting / Winemaker — that pre-select permission sets, then an "Advanced"
expander fine-tunes individual permissions
(`vintrace:setup-and-admin/configuration/managing-user-accounts-central-authorisation-sso-enabled.md:85-95`).
In multi-winery "All Winery mode" the effective permission set is the **intersection** across wineries
(same doc:97-99). SSO methods: native, Apple, Google, Microsoft (default-on) + **Okta OIDC** (config
required) (`vintrace:setup-and-admin/configuration/managing-sso-methods.md:16-56`). A vendor-reserved
"System Administrator" account sits above the winery's own admin (`managing-system-users.md:31`).

**(c) A 3-tier defaults hierarchy (User > Winery > System).** Defaults **pre-fill but never lock** a
field (`vintrace:setup-and-admin/configuration/vintrace-defaults.md:18,38`). System defaults need Local
Admin; Winery defaults can be delegated via `Can Change Winery Defaults`; User defaults are self-service,
and an in-op "heart icon" pins a value as a personal default on the fly (same doc:42-64).

**Configurable catalogs (the breadth).** The multi-winery availability matrix enumerates vintrace's full
configurable-object set (`vintrace:setup-and-admin/configuration/configuration-for-multi-winery-support.md:27-54`):
**Additives, Additive templates, Analysis templates, Barrel/Crush/Equipment/Ferment/Product treatments,
Treatment agents, Spray agents, Closures, Dry goods, Glass/containers, Other stock, Metrics, Blocks,
Vineyards, Standard notes, Standard tasks, Work order templates, Custom print templates, Saved searches,
Stock items.** Each is **assignable/unassignable per winery** (Local Admin or All-Winery permission).

- **Additives / treatments** are deep and behaviorally rich: an additive links a `Cause Treatment`
  (yeast → auto-start ferment), carries an allergen flag+text feeding the Label Integrity Statement, a
  Linked Stock Item, and a Cost Item (`vintrace:vintrace-web/lab-work/setting-up-an-additive.md`).
  Additive templates add a **Target checkbox** that computes the dose to hit a metric target
  (`setting-up-an-additive-template.md:37-42`). Separate **Product Treatments** model composition-neutral
  actions (filtration, splash-rack, heat/chill) with optional state change and cost item
  (`vintrace:vintrace-web/winemaking/setting-up-a-product-treatment.md`).
- **Analysis / metrics** are a rules engine: each `Metric` carries a ppm↔g/L factor, unit, allergen,
  code alias, min/max **visual-alert** thresholds, blend-calc flag
  (`vintrace:vintrace-web/lab-work/setting-up-a-metric.md`); `Analysis Templates` bundle metrics + auto
  state-change + a cost amount + "Default for" fruit/ferment (`setting-up-an-analysis-template.md`); and
  **Metric Thresholds + Metric Action Policies** auto-advance product state/grading when a condition set
  is met (`metric-thresholds-and-metric-action-policies.md`).
- **Product States** are a **winery-defined lifecycle vocabulary** with auto-transition rules driven by
  additive/analysis templates and treatments (`vintrace:setup-and-admin/configuration/product-states.md`)
  — vintrace's workflow spine.
- **Work-order templates** are **free-composition (clone-a-WO / "Save As Template")** bundles of jobs +
  instructions + notes; there is no separate typed-field abstraction and **no documented versioning**
  (`vintrace:vintrace-web/work-orders/work-order-templates.md:18`, `creating-a-work-order-template.md:34-64`).
- **Custom print templates** are **DOCX with coded tags** (`{{assignedToName}}`), enabled by switching the
  printed-WO format to "MS Word (v6+)" — legacy formats "do not allow any customization"; localized (e.g.
  Spanish) variants exist (`vintrace:setup-and-admin/custom-print-templates/enabling-custom-print-templates.md:24-30`).

**Auto-codes — the standout naming engine.** Rule-based identifier generation for **~17–18 record types**
(barrel, barrel group, batch, bin, booking, crush load, fruit intake, grower, gyro cage, sales order,
sample set, stock item, tirage group, trial blend, wine batch component) from three element types —
**Attribute / Inc(rement) / Text** — plus Custom Codes; multiple policies per type with a default settable
at System/Winery/User and a per-record "wand" override
(`vintrace:setup-and-admin/configuration/configuring-and-using-auto-codes.md:20-165`). A separate
**winery-specific prefix** stamps WOs, fruit dockets, and bills of lading
(`vintrace:setup-and-admin/configuration/specifying-a-winery-specific-prefix.md`). **No Cellarhand
equivalent exists.**

**Units of measure** are **distributed, not a master toggle**: per-metric "Qualitative Unit" + ppm↔g/L
factor; per-operation via the defaults hierarchy ("Crush Fruit In" sets intake UOM,
`vintrace-defaults.md:74`); vessel capacity carries Litres-or-Gallons as data. vintrace serves AU/NZ/US,
so metric and imperial coexist by field.

**Integrations.** Labs (ETS, Baker, Anton Paar, Admeo/Y15, BarrelWise) configure identically: add the lab
as an Address Book Organization with the "Laboratory" role → pick a **Web Service Type from a fixed
dropdown** that auto-fills the endpoint → enter credentials → map metric names
(`vintrace:setup-and-admin/integrations-labs-and-tanks/baker-lab-integration.md:60-67`,
`vintrace-web/lab-work/mapping-a-lab-s-metric-names.md:16`). This is a **hardcoded connector registry** —
a winery cannot add an arbitrary lab endpoint. **Tank controllers (TankNET/VinWizard) are
vintrace-Support-provisioned server-side** with hardcoded default ports; the winery only sets a per-tank
"Tank Control ID" (`tank-controller-integration.md:45-59`). Accounting is **push-only, price-only**:
"This connection is a **one way connection**… **No cost information (COGS) is pushed to Xero**"
(`vintrace:setup-and-admin/integrations-accounting/xero-integration.md:18-20`); QuickBooks sync is scoped
to client-billing invoices only. DTC/POS has **no native connector** — a stub doc points at "our open
APIs" (`integrations-ecommerce-and-pos/point-of-sale-pos-integration.md`, created 2026-02-27). The
REST/OpenAPI is real; tokens are **user-bound and self-serve now** ("API tokens… can **now** be generated
in vintrace"; legacy support-issued tokens still linger unnamed —
`vintrace:setup-and-admin/api/managing-api-tokens.md:16,32`).

**Custom-crush surface.** Owner/client **read-only logins** (see only their wines; Local-Admin-created;
"may require a change to your subscription") and **AP02** alternating-proprietorship bonded clients (Owner
org → "AP Owner" → TTB bond info; "The AP02 bond will always take precedence")
(`vintrace:setup-and-admin/configuration/managing-owner-client-logins.md:16-31`,
`setting-up-ap02-licenses.md:16-39`). Subscription seats/modules/AP02/owner-logins are **vendor-gated
(request-a-quote)**, not self-serve (`managing-your-subscription-and-licenses.md`).

---

## 2. InnoVint configuration model — 4 capability levels + an owner-based-permissions overlay

InnoVint is the modern-cloud incumbent, and its config model is **deliberately simpler and more opinionated**
than vintrace's — a small fixed set of capability levels, a lot of **fixed menus you select from rather than
define**, and a heavy reliance on **InnoVint Support to provision backend reference data**.

**The 4 capability levels (exactly one per member)**
(`innovint:new-to-innovint/settings-make-grow-finance/overview-user-permissions-and-capability-levels.md:14-88`):
1. **Admin** — unrestricted: manage users + capability levels, WO settings/templates/analysis panels,
   custom attributes, lock backdating, dip charts, harvest settings, shipping locations, BOL legal
   language, and (if custom-crush permissions active) set up Owners.
2. **Team Member** — full operational access (view/add/edit inventory + activity, create AND submit WOs,
   edit templates/panels), but cannot manage users or (under owner-permissions) create Global/No-Owner
   inventory or edit Owners.
3. **Team Member – Cannot Submit Work Orders** — identical minus WO submission (can start/complete; an
   Admin/full Team Member submits).
4. **Read Only** — view + run/export reports (incl. TTB 5120.17), Display Preferences only; no changes.

**Costing (COGS) access is an orthogonal 3-level axis** (Full / Read-Only / No Access) that does not track
capability level — a Read-Only member can have Full costing access (same doc:21-29,90-102). Every new user
defaults to **Read Only, no owner permissions**
(`innovint:new-to-innovint/settings-make-grow-finance/member-management-how-to-add-edit-or-remove-users.md:49,69`).
Members also carry **up to 3 descriptive "roles"** (industry facets), which are labels, not authorization
(same doc:74). No SSO/SAML is documented; MFA is **opt-in at the user level** (TOTP only, no SMS/push), with
an undocumented org-domain enforcement setting (`.../accessing-innovint/multi-factor-authentication-mfa-settings.md:24,78`).
InnoVint **does not charge per user** (member-management:96) — a flat-seat model.

**Owner-based permissions (the custom-crush overlay).** This is an **activated feature, not on by default**
("You have just activated a permission-based system…" —
`innovint:make-advanced-features/owner-based-permissions-system/setting-up-your-custom-crush-permissions.md:13`;
`.../owner-based-permissions-and-member-capabilities-overview-highlight.md:14`). It tags lots, vessels,
vineyards, additives, work orders, and WO templates with an **Owner (orange tag)**; a scoped user's web +
mobile view is limited to their Owner's inventory, and clicking a lot they don't own is blocked. Three
ownership types per item: **one-or-more Owners**, **Global** (Admin-create only), **No Owners** (Admin
only). Capability levels **stack** with owner scope; a Team Member can be granted "Everything in the
winery" but still cannot create Global inventory or edit Owners/Users (overview-highlight:22-56). Turning it
on defaults all existing inventory to **No Owners** and all members to **Everything in the winery** — both
must be manually re-scoped (setting-up:46,62). The **Owner-Permissions + COGS costing-permission combo is
not self-serve — you must email support** (member-management:78). This is InnoVint's answer to vintrace's
owner-logins/AP02, but expressed as an intra-account visibility filter rather than a separate login class.

**Support-gated backend reference data (the recurring wound).** InnoVint routinely puts things behind a
support ticket that a winery would expect to self-serve:
- **Bonds** — MAKE: submit a ticket ("Add new bond")
  (`innovint:new-to-innovint/settings-make-grow-finance/how-to-add-a-new-bond-in-make.md:14-24`); SUPPLY:
  **"Both bonds and locations must be added on the backend by InnoVint's Support Team"**
  (`innovint:supply/getting-started-with-supply/how-to-add-bonds-and-locations-in-supply.md:8`).
- **Vendors** (additives) — "If your vendor does not appear… email support@innovint.us"
  (`innovint:make/dry-goods/how-to-create-and-receive-dry-goods-additives-packaging.md:52`).
- **Analysis sources** — "reach out to us… to consider adding your desired analysis source"
  (`innovint:make/analysis/options-to-record-analysis-data.md:42`).
- **Barrel/vessel attribute enums** — "Is there an attribute missing? Reach out and let us know"
  (`innovint:new-to-innovint/getting-started-make-grow-finance/step-2-add-your-vessels.md:58`).
- **First weigh-tag number** — "cannot be edited by Admins," support-set
  (`innovint:harvest/settings-preferences/editing-weigh-tag-settings.md:28`).
- **Desktop language translation** — support activates the beta feature winery-wide
  (`.../settings-make-grow-finance/display-preferences-in-settings.md:41-50`).
- **User email/name changes** — nobody can, not even Support (recreate the user)
  (member-management:100); passwords are Zero-Trust (Support cannot reset).

**Templates / catalogs — "select from a fixed menu," rigid, sometimes paywalled:**
- **Work-order templates** exist and are the "protocol" primitive, but are **shallow**: they save the task
  sequence + instructions/fields/notes, **but NOT lots/vessels** (re-added every use); in Settings you can
  only **rename/delete** (edit = load → change → re-save); recurrences are independent with **no bulk
  delete** (`innovint:make/work-orders/creating-work-order-templates.md:22-38`,
  `how-to-create-recurring-work-orders.md:42`). **Task kinds are a closed hardcoded catalog**; the only
  extensibility is the note-only **Custom Task** (`innovint:make/recording-actions/using-a-custom-action-or-custom-task.md:16`).
- **Additive catalog** is self-serve but rigid: fixed product-type list; **units permanently lock after
  creation** ("a new product will need to be created"); custom units or a missing default rate **silently
  deactivate the calculator** (users hack `0.0001` to keep it alive)
  (`innovint:make/dry-goods/how-to-create-and-receive-dry-goods-additives-packaging.md:62-81`). Batch
  tracking + the additive calculator itself is **subscription-gated**
  (`make/additions/feature-option-simple-additions-vs-additions-using-the-dry-goods-batch-tracking-calculator.md:46`).
  SO₂ chemistry is hardcoded by form (`how-innovint-calculates-so-additions.md`).
- **Analysis** is select-from-menu: analysis **types and sources are InnoVint-controlled**; **panels are
  immutable** (delete + recreate; units don't stick)
  (`innovint:make/analysis/analysis-panels-how-to-create-save-and-delete.md:29-39`); per-lot-stage display
  is **capped at 7** (`how-to-set-custom-lot-stage-analyses.md:44`). Winery-specific structured metadata
  lives in the **paid MAKE-Plus "Custom Lot Attributes"** (single-select/text/number/date fields on lots
  only) (`innovint:make-advanced-features/custom-attributes/custom-lot-attributes.md:14,36`). A notable
  modern touch: **AI Analysis Import** (photo/PDF → Gemini extraction, Admin opt-in)
  (`make/analysis/ai-analysis-import.md:143`).
- **Cost categories** are a fixed suggested list the winery picks from ("start simple… add complexity
  later"), not winery-defined (`innovint:finance/getting-started/onboard-starting-costs-cost-settings.md`).
- **Winery Lock Backdating** (Admin-only, account-wide, separate winery/cost locks) protects filed
  reports/closed books (`.../settings-make-grow-finance/winery-lock-backdating.md:22-49`). **Dip charts**
  are subscription-gated + Admin-activated (`managing-and-using-dip-charts-in-innovint.md:14,33`).
- **Vessel numbering / naming conventions** are a **pre-onboarding customer decision** (e.g. "YY-0001"),
  not an app auto-code feature (`.../getting-started-make-grow-finance/pre-onboarding-guide-checklist.md:45,90`;
  vessel codes restricted to `[A-Z0-9-_]` caps) — **no built-in auto-code/naming-template engine** (a real
  gap vs vintrace).

**Integrations (8, all partner/support-activated; thin code-mapping config, no self-serve OAuth):**
VinWizard + TankNET-Pro (tank automation, vessel-code mapping), Onafis (densimeters, two-way), BarrelWise
(free-SO₂), Baker (**per-user PAT** — the only public-API path), ETS Labs, WinePulse (DTC profitability;
needs Cost + Case Goods modules), Commerce7 (in the SUPPLY module)
(`innovint:make-advanced-features/integrations/*`, `supply/using-supply/supply-commerce7-integration.md`).
Every one requires a support ticket and/or a partner subscription to activate.

---

## 3. Configuration-surface matrix

Cellarhand tags: **[IMP]** = [IMPLEMENTED], **[PLAN]** = [PLANNED], **[ABS]** = [ABSENT].

| Config area | vintrace | InnoVint | Cellarhand (3-state) | Notes |
|---|---|---|---|---|
| **Permission model** | Flat ~50-permission capability list; roles = categorization only | 4 fixed capability levels + orthogonal 3-level COGS axis | **[IMP]** admin/user stub only (`authority.ts:11-14` `canApprove` = admins only); org roles owner/admin/member via better-auth (`schema:124`) | Both incumbents far ahead; **[PLAN]** Phase 23 = typed capability×domain matrix, cloneable versioned role templates |
| **Owner/client scoping** | Read-only owner-logins + AP02 bonded clients (separate login class) | Owner-based-permissions overlay (Owner tags gate visibility) | **[IMP]** cost-only `LotOwnership` tag (ESTATE/CUSTOM_CRUSH_CLIENT); **no** access/visibility scoping, **no** change-owner op | **[PLAN]** Phase 23/24 owner-scoped RLS + client portal (D21) |
| **SSO / auth methods** | Native + Apple/Google/Microsoft/Okta OIDC | None documented; user-level TOTP MFA only | **[IMP]** email+password only (`auth.ts:11`); no social/SSO/MFA | Both incumbents have social/SSO; Cellarhand behind on auth options |
| **User invite / lifecycle** | Email invite (SSO) or admin-set password; Active/Disabled/Pending | Email invite; Read-Only default; flat seats | **[IMP]** better-auth org+invitation tables exist (`schema:138`); **[ABS]** no member-management UI (settings has only accounting/commerce cards) | Invite plumbing present, admin UI not built |
| **Auto-codes / naming templates** | Deep engine: ~17 record types, Attribute/Inc/Text, per-type default + override; winery prefix | **[ABS]** — vessel/lot numbering is a manual pre-onboarding convention | **[ABS]** lot code = hardcoded `YEAR-VINEYARD-BLOCK-VARIETY[-TAG]` (`lot/code.ts:45-64`); no template, no per-tenant scheme, no rename | vintrace is the clear leader; InnoVint & Cellarhand both hardcode/omit |
| **Work-order templates** | Free-composition (clone-a-WO); no versioning | Reusable but shallow (task sequence + fields, **not** lots/vessels; rename/delete only) | **[IMP]** typed-field, **versioned, clone-on-customize** templates; issued WO snaps a version (`WorkOrderTemplateVersion`); assistant can author them | Cellarhand's template model is the **most rigorous of the three** (typed + versioned) |
| **Task/op kinds** | Standard job types + product treatments (rich catalog) | Closed hardcoded task-kind list + note-only Custom Task | **[IMP]** fixed `OperationType` enum (21 values) + WO kinds OPERATION/OBSERVATION/MAINTENANCE/NOTE | All three fix the op vocabulary; none let a winery define a new *typed* op |
| **Additive / treatment catalog** | Deep: additives + templates + 5 treatment classes + agents; cause-treatment, target-dose, allergen, cost/stock links | Self-serve products but rigid (locked units, calc deactivation), subscription-gated calculator; vendors support-added | **[IMP]** per-tenant material catalog (`cellar/materials.ts` create/update/receive/deactivate); kind taxonomy (Additive/Cleaning/Packaging/Other) + subcategory; onboarding seeds starter materials | Cellarhand catalog is self-serve + editable; lacks vintrace's target-dose/cause-treatment automation |
| **Analysis metrics / panels** | Rich metric config (factors, thresholds, action policies, blend-calc); analysis templates | Select from fixed types; panels immutable; per-stage capped at 7; MAKE-Plus custom attributes | **[IMP]** analyte catalog is **developer config** (`chemistry/analytes.ts` — code file, append-only), NOT per-tenant editable; no winery-defined metric/panel/threshold-policy | Both incumbents let the *winery* configure metrics; Cellarhand's is dev-time |
| **Units of measure** | Distributed (per-metric + defaults hierarchy); metric+imperial coexist | Per-additive at creation (locked); no global toggle | **[IMP]** canonical metric storage; imperial/metric **input** conversion at intake/dose boundary (`units/measure.ts`); no per-tenant unit-system setting | All three lack a clean master unit toggle; Cellarhand normalizes to metric internally |
| **Costing policy / defaults** | Ledger accounts (Direct/Indirect, Syncable), default ledger accounts, 3-tier defaults | 3-level COGS access; fixed cost categories; lock backdating | **[IMP]** per-tenant costing policy: method (WA/FIFO), 5 capitalize toggles, versioned (`AppSettings`, `settings/actions.ts saveCostSettings`); D17 policy-version stamping | Cellarhand's versioned no-retro-revalue policy is a genuine strength |
| **Tenant currency** | Per-winery (multi-currency, WET/NZ-excise aware) | Not a documented setting | **[IMP]** tenant currency {USD,EUR,NZD,AUD,ZAR,GBP} (`money/currency.ts`), symbol prefix everywhere | Parity-ish; Cellarhand federal TTB stays USD |
| **Feature toggles** | Plan-gated modules (Inventory, DSP, etc.) | Heavy module/subscription gating + beta flags | **[IMP]** `sparklingEnabled` per-tenant (`settings/actions.ts`); no billing/module system | **[PLAN]** Phase 17 Stripe billing; Cellarhand has one feature flag today |
| **Custom print templates** | DOCX + coded tags; localized; per-winery | Label print (fixed); troubleshoot-only | **[ABS]** WO print route exists but no configurable template | vintrace clear leader |
| **Backdating / period lock** | `Can Close Off a TTB702 Period…` permission | Winery Lock Backdating (Admin, winery + cost) | **[IMP]** append-only ledger + LEDGER-11 (correction blocked if later op touched positions); filed-period amend drives Amended TTB — **structural, not a config lock** | Cellarhand achieves the *goal* (protect closed history) architecturally, no toggle needed |
| **Lab integration config** | Fixed connector-registry dropdown + metric-name mapping (self-serve) | 6 lab/tank partners, support-activated, code-mapping | **[ABS]** no lab/instrument integration | **[PLAN]** open API (D20); not built |
| **Tank / scale / sensor** | TankNET/VinWizard support-provisioned; scales = label print | VinWizard/TankNET/Onafis/BarrelWise (support-activated) | **[ABS]** | **[PLAN]** Phase 29 sensor/telemetry |
| **Accounting integration** | Push-only, price-only (Xero one-way; QBO client-billing) | WinePulse/Commerce7 via modules | **[IMP]** two-way QBO (transactional outbox, exactly-once poster, AP Bill, reconcile) — account mapping in Settings | **Cellarhand ahead**: two-way vs vintrace one-way price-only |
| **DTC / POS** | No native connector (open-API stub + PDF guide) | Commerce7 in SUPPLY module | **[IMP]** native two-way Commerce7 (SALE depletion + revenue posting; built, live-verify pending) | **Cellarhand ahead** on native DTC |
| **Public API / tokens** | REST/OpenAPI; user-bound self-serve tokens (migrating off support-issued) | Per-user PAT only (no OAuth app model) | **[PLAN]** open tenant-scoped API + webhooks (D20); not built | Both incumbents have *some* API; Cellarhand's is planned but architecturally seeded (D20 tool-contract registry) |
| **Sandbox / test env** | Self-serve sandbox copy + "Refresh From Backup" | Onboarding-guided; no self-serve sandbox documented | **[IMP]** Demo Winery seed tenant (`seed:demo-tenant`); **[PLAN]** in-app god-mode/sandbox (Phase 21a) | Cellarhand has a dev sandbox convention, not a user-facing one |
| **Import / migration** | CSV import (1000-row cap), `Import/Export Setup Data` permission | Guided onboarding + AI analysis import; CSV | **[IMP]** internal legacy-lot script + finished-goods CSV only; incumbent codes discarded | **[PLAN]** Phase 13 (the GTM wedge, unbuilt) |

---

## 4. Hardcode-wounds found (a late-added toggle admits a prior hardcode)

### vintrace (steadily promoting hardcodes into permission/policy toggles)
- **Overfill prevention** — the clearest: "**Previously**, there were warnings… but you could still
  proceed… **Now**, when the 'Prevent overfilling vessels' setting is ticked… you will not be able to save"
  (`vintrace:vintrace-web/winemaking/prevent-overfilling-vessels.md:38-42`) — a whole new System-Policy
  config surface born from a hardcoded behavior.
- **Version-gated permissions**: `Can Add Costs on Receival` (v9.4.3), `Can Adjust Work Order Status
  Backwards` (v9.10.1, introduced a configurable WO status flow), `Can Adjust Allocation Product Status`
  (v9.9.1) (`roles-and-permissions.md:87,101,131`). Several exist but are **support-gated to enable** even
  though the permission is present (`:159,165`).
- **API tokens** — "can **now** be generated in vintrace"; "API Tokens **previously generated by
  support**… contact support before making any changes" (`managing-api-tokens.md:16,32`) — the token model
  is mid-migration from support-issued opaque tokens to user-bound self-serve.
- **Multi-winery item availability** — "vintrace has **improved** support… The enhancement features…"
  (`configuration-for-multi-winery-support.md:16`) implies items were previously global-only.
- **Lab entry** — "vintrace's **improved** lab entry workflows… This latest enhancement lets you save an
  analysis on a vessel… when there is no wine" (`improved-lab-entry-workflows.md:15-18`).
- **Accounting** — the one-way, no-COGS Xero limitation is a live wound, not yet healed
  (`xero-integration.md:18-20`); DTC/POS is offloaded to the open API (stub doc, 2026-02-27).

### InnoVint (heavy module-gating + support-mediated backend data)
- **Support-only reference data**: bonds (MAKE ticket / SUPPLY backend), **vendors**, **analysis sources**,
  **barrel/vessel attribute enums**, **first weigh-tag number** — all require emailing support. Each
  "reach out and let us know" is a wound where the winery clearly wanted self-serve
  (`how-to-add-a-new-bond-in-make.md`, `how-to-create-and-receive-dry-goods-additives-packaging.md:52`,
  `options-to-record-analysis-data.md:42`, `step-2-add-your-vessels.md:58`, `editing-weigh-tag-settings.md:28`).
- **Permanently-locked additive units** + the **`0.0001` fake-rate hack** to keep the calculator alive
  (`how-to-create-and-receive-dry-goods-additives-packaging.md:62-81`) — a rigid data model users route
  around.
- **Immutable analysis panels** (delete + recreate) and **units not sticking** on panels
  (`analysis-panels-how-to-create-save-and-delete.md:29-39`).
- **WO templates don't save lots/vessels** and can't be content-edited in Settings
  (`creating-work-order-templates.md:22-38`); recurrences independent, **no bulk delete**.
- **Paywalls admitting missing base config**: MAKE-Plus **Custom Lot Attributes** ("Tags can become broad,
  inconsistent… consider Custom Attributes" — `custom-lot-attributes.md:16`) is the pay-tier answer to the
  absence of a structured winery-metadata schema; Dry-Goods calculator, Tank Maps, Dip Charts, Intended Use
  (beta), Vineyard Contracts all module-gated.
- **"You can now" markers** confirming prior hardcodes: "create a lot without composition," "bulk edit
  vessel ending fills on Drain and Press" ("Strange but true, this option didn't exist before!").
- **Rigid identity/auth**: no self-serve owner-permission activation, Owner+COGS combo needs support
  (member-management:78), no email/name edits ever, Zero-Trust password (Support can't reset).

---

## 5. Cellarhand today (3-state read)

**[IMPLEMENTED] — the real config surface is small but principled.** A tenant admin can set, in Settings:
`sparklingEnabled`, tenant `currency`, and the **versioned costing policy** (method + 5 capitalize toggles,
D17 no-retro-revalue) (`AppSettings`, `src/lib/settings/actions.ts`), plus **accounting/commerce account
mappings** (QBO AP + DTC revenue accounts). A tenant can self-serve **edit its material/additive catalog**
(`src/lib/cellar/materials.ts`), and **author typed, versioned, clone-on-customize work-order templates**
(`WorkOrderTemplate`/`WorkOrderTemplateVersion`) — including via the assistant. Multi-tenancy config
discipline (D16) is the strongest structural asset: per-tenant uniqueness + Postgres RLS, so a config
change can't leak across wineries.

**[IMPLEMENTED but dev-time, not winery-config]:** the **analyte catalog** is a code file
(`src/lib/chemistry/analytes.ts` — "CONFIG, not schema… adding an analyte is a one-line edit here"), and
the **units engine** (`src/lib/units/measure.ts`) is a hardcoded factor table with metric as canonical.
Neither is per-tenant editable. **Lot/blend naming** is a hardcoded scheme
(`YEAR-VINEYARD-BLOCK-VARIETY[-TAG]`, `src/lib/lot/code.ts`) with **no template, no per-tenant scheme, no
rename** — the code doubles as the unique key and is invariant-pinned immutable.

**[IMPLEMENTED — permission stub]:** authorization is **admin/user only** (`authority.ts` `canApprove` =
admins; `shouldAutoFinalize` for self-executed WOs). better-auth supplies org roles (owner/admin/member)
and invitation tables, but there is **no member-management UI** and no capability×domain matrix.

**[IMPLEMENTED — Cellarhand ahead of at least one incumbent]:** two-way QBO accounting (vs vintrace's
one-way price-only), native two-way Commerce7 DTC (vs vintrace's open-API-only), and a **structural**
closed-period protection (append-only ledger + append-only corrections + LEDGER-11) that needs no lock
toggle and drives Amended TTB automatically.

**[PLANNED]:** granular RBAC — typed capability×domain matrix, cloneable/versioned role templates,
owner/vineyard data-scope predicates enforced in RLS (Phase 23; ROADMAP:1217-1252, honoring D9/D14/D16/D21);
owner-scoped client portal + contracted rate cards in Settings (Phase 24, D21); open tenant-scoped
public/partner API + webhooks off the ledger, all a projection of the single **tool-contract registry**
(D20); SaaS billing/module toggles (Phase 17); in-app god-mode/sandbox/onboarding (Phase 21a); migration
importers with `sourceSystem`/`sourceId` external ids (Phase 13).

**[ABSENT]:** auto-code/naming-template engine; per-tenant winery-defined analysis metrics/panels/threshold
policies; SSO/social login/MFA; configurable print templates; lab/tank/scale/sensor integrations; any
"change ownership" operation.

---

## 6. Convergence / divergence / both-struggle

**Converge (table stakes Cellarhand must match):**
- **Self-serve additive/treatment + analysis-panel catalogs configured by the winery.** Both incumbents
  give the winery a rich, self-editable catalog of additives/treatments and analysis metrics/panels.
  Cellarhand has the additive catalog **[IMP]** but analytes/panels are **dev-time [IMP]** — the gap is
  per-tenant metric/panel configuration.
- **A capability model beyond admin/everyone.** vintrace (~50 permissions) and InnoVint (4 levels + COGS
  axis + owner overlay) both let a facility separate cellar-tech / bookkeeper / read-only / client. This is
  the biggest converged gap vs Cellarhand's admin/user stub — squarely **[PLAN] Phase 23**.
- **Owner/client scoping for custom crush.** Both serve it (vintrace owner-logins + AP02; InnoVint
  owner-based permissions). Cellarhand has only the cost-only ownership tag today; **[PLAN] 23/24**.
- **Reusable work-order templates.** Converged — and here **Cellarhand's typed+versioned model is the best
  of the three** (vintrace has no versioning; InnoVint templates don't even save lots/vessels and are
  rename/delete-only). A durable differentiator hiding inside a table-stakes feature.
- **Backdating / closed-period protection.** Both incumbents solve it with a **config lock**; Cellarhand
  solves it **structurally** (append-only + LEDGER-11 + auto-Amended-TTB) — a stronger design that avoids
  the "temporarily move the lock, edit, reset" dance both incumbents document.

**Diverge (design choices worth a recommendation):**
- **Naming/identity.** vintrace = a powerful configurable auto-code engine across ~17 record types;
  InnoVint = manual pre-onboarding conventions (no engine); Cellarhand = hardcoded immutable scheme. Three
  different philosophies. Cellarhand's surrogate-id/label split is architecturally the cleanest foundation
  but ships **zero configurability** — the opposite end from vintrace.
- **Permission philosophy.** vintrace flat-capability-list vs InnoVint fixed-levels+overlay. Cellarhand's
  Phase-23 plan (capability×domain matrix + owner/vineyard data-scope in RLS) is closer to InnoVint's
  clean-levels-with-scoping than vintrace's sprawl — the right instinct; the scoping-in-RLS discipline is a
  differentiator.
- **Integration model.** Both incumbents hardcode connector registries and lean on Support/partner
  activation (vintrace's fixed lab dropdown + support-provisioned tank controllers; InnoVint's 8
  support-activated partners, per-user PAT). Cellarhand's D20 (open, self-serve, tenant-scoped API +
  event-driven adapters off the ledger) is a deliberate anti-lock-in divergence — **but it is [PLAN], not
  shipped**, so today Cellarhand simply lacks lab/tank integrations the incumbents have.

**Both struggle (differentiation openings):**
- **Self-serve integrations / no OAuth app model.** Neither incumbent lets a winery wire an arbitrary lab
  or instrument without a support ticket / partner deal; InnoVint has no OAuth app model at all (per-user
  PAT). A modern self-serve integration + open-API story (D20) is a clean wedge.
- **Support-gated reference data.** InnoVint's bonds/vendors/analysis-sources/vessel-attributes-by-ticket
  is pure friction; vintrace gates seats/logo/some-permissions behind the vendor. **Everything self-serve**
  is a credible positioning line.
- **Winery-defined structured metadata.** InnoVint charges (MAKE-Plus Custom Lot Attributes) for what is
  essentially "let me add my own fields"; vintrace has no clean equivalent. A free, first-class custom-field
  / naming-template layer would land.
- **Auto-code parity is unclaimed by the modern incumbent.** InnoVint has no naming engine at all — so
  Cellarhand can leapfrog InnoVint here without matching vintrace's full complexity.

---

## 7. Recommendations (for Cellarhand — labeled, not a planning-doc edit)

1. **Separate a renameable presentation layer from the immutable surrogate id, then add a naming-template
   engine (Phase 13-adjacent).** Today `Lot.code` is immutable, scheme-hardcoded, and doubles as the unique
   key (`lot/code.ts`, §5 of the current-state brief). vintrace's auto-codes prove wineries want to define
   their own convention across record types; InnoVint's *absence* of one means matching vintrace even
   partially leapfrogs the modern incumbent. Recommend a `displayName`/`label` field distinct from the
   unique surrogate + a per-tenant token-order template (the pieces — `buildLotCode`, `normalizeAbbr`,
   `disambiguate` — already exist to templatize). This also unblocks migration (importing incumbent codes
   instead of discarding them).

2. **Promote the analyte catalog and units from dev-config to per-tenant config.** `chemistry/analytes.ts`
   and `units/measure.ts` are code files; both incumbents let the winery configure metrics/units. A
   tenant-scoped metric/panel/threshold table (mirroring the append-only, stable-key discipline already in
   the analyte file) closes a converged table-stakes gap. Keep canonical metric storage; expose a per-tenant
   display-unit preference.

3. **Build Phase 23 as a capability×domain matrix with owner/vineyard scope enforced in RLS — and learn
   from both incumbents' wounds.** Match vintrace's *cost/compliance granularity* (view-cost vs adjust-cost;
   tax-state vs bond-move vs close-period) because it's a real compliance selling point, but keep
   InnoVint's *clean small level set* as the default UX (cloneable role templates over the granular
   vocabulary — already the plan). Enforce owner-scope as a **fail-closed RLS predicate**, not UI hiding
   (the plan is right; the intra-tenant-leak blast radius justifies the DB-level discipline). Ship a
   member-management UI (the better-auth invitation plumbing already exists) even before the full matrix.

4. **Make "everything self-serve, no support ticket" an explicit product principle and a demo line.**
   InnoVint's support-gated bonds/vendors/analysis-sources/vessel-attributes and vintrace's vendor-gated
   seats/logo are concrete friction. Cellarhand's admin-editable catalogs + RLS tenancy already point this
   way — codify it: bonds/premises, vendors, vessel attributes, and analysis sources should all be
   tenant-editable tables, not code enums or support tickets.

5. **Turn the D20 open API + self-serve integrations into shippable near-term surface, not just a vision.**
   Both incumbents struggle here (no self-serve OAuth; support-activated partners). Even a minimal
   tenant-scoped read API + webhooks off the ledger, plus a self-serve lab-result CSV/API ingest (InnoVint's
   AI-analysis-import shows the demand), would be a differentiator disproportionate to its cost — and it's
   the anti-lock-in wedge the strategy already names.

6. **Keep the structural closed-period protection; don't add a backdating-lock toggle to mimic the
   incumbents.** Cellarhand's append-only ledger + LEDGER-11 + auto-Amended-TTB already deliver the
   *outcome* both incumbents reach with a config lock and a clumsy "unlock → edit → relock" workflow.
   Market this as a correctness advantage rather than replicating the toggle.

7. **Lead with the work-order template model in custom-crush/enterprise sales.** Cellarhand's typed +
   versioned + clone-on-customize templates (with an issued WO snapping a version) are strictly more
   rigorous than either incumbent's (vintrace unversioned clone-a-WO; InnoVint templates that don't save
   lots/vessels and can't be edited in Settings). This is a rare place where a table-stakes checkbox is
   actually a differentiator today — say so.
