# RFC-004 · Vessel tags — QR and NFC scan-to-context

**Status:** proposed · **Owner decisions required:** OD-6 (hardware) + a NEW prerequisite decision on rate limiting (§3.5.1) · **Blocks:** the scan control, runner re-anchoring

> [!note] Changelog
> **2026-07-29 — RFC amendment pass, against `main` @ `91cd1dcd`.** Amended to be implementable
> against the code that exists. This RFC remains **`proposed`**; the amendment does not approve it.
> - **§2 ("None") verified accurate** — the only RFC in the set whose current-behaviour section was
>   correct. No `BarcodeDetector`, no `NDEFReader`, no `tagToken`, no `/t/` route anywhere in
>   `src/`.
> - **NEW §3.5.1 — rate limiting is an unbuilt PREREQUISITE, not an implementation detail.**
>   §3.5 requires *"Rate-limit token resolution to prevent enumeration"*, and **no inbound
>   rate-limiting infrastructure exists in this codebase.** It is recorded here as a prerequisite
>   with an owner decision attached, so it cannot ship as an unmet line in an approved RFC.
> - **NEW §3.5.2 — "tenant-scoped" is made explicit** as an RLS-backed tenant read, because the
>   tempting implementation violates `TENANT-1`.
> - **§3.1 gains a naming warning:** the register's planned first-class `Tag` model is a *different
>   object* from this RFC's `tagToken`. Same word, two things.
> - **OD-6 itself survives on the data model** and is ready to ratify with the §3.5.1 answer
>   attached.

---

## 1. User problem

At 8,142 barrels, finding one specific barrel in a list is not a realistic interaction. A cellar hand standing at C-1410 needs the app to already know that. Today there is **no barcode support anywhere in the product** (no `BarcodeDetector`) and **no geolocation** — every vessel is chosen from a picker.

Scan is the difference between a runner that works and a runner that fights the user the moment they break sequence.

## 2. Current behaviour

None. Vessels are identified by `code` (barrel number or tank code) and selected from dropdowns or pickers.

## 3. Proposed behaviour

### 3.1 Tag identity

Each taggable object — barrel, tank, keg, barrel group, and optionally a rack — carries a **tag identifier** distinct from its human code. Recommended payload: an opaque, tenant-scoped, URL-safe token encoded as a URL so that a phone's native camera also resolves it:

```
https://<app-host>/t/<tagToken>
```

`/t/<tagToken>` resolves server-side to the object and redirects into the app (or into the runner, if one is open). A raw code is deliberately **not** used as the payload: codes are reused across tenants and change when a barrel is renumbered.

Tokens are tenant-scoped. A tag from another winery resolves to a clear refusal, never to a foreign object. **See §3.5.2 for how — the obvious implementation violates `TENANT-1`.**

> [!warning] Naming collision — settle it before either object is built.
> The coalescence register plans a **first-class `Tag` model** as a P1 item
> ([`data_model_coalescence.md:162`](docs/architecture/data_model_coalescence.md:162)) — an
> InnoVint-style **client-lot sort key**, used to organise lots. That is a **completely different
> object** from this RFC's `tagToken`, which is a **physical label stuck to a barrel**.
>
> Same word, two things, both planned. **Name them differently now** — e.g. `Label`/`labelToken`
> for the physical tag, reserving `Tag` for the lot sort key — or expect to spend a year
> disambiguating in code review and in conversation with the winemaker.

### 3.2 Read paths

| Path | Platform | Notes |
|---|---|---|
| `BarcodeDetector` (QR) via camera | Chrome/Android, Safari 17+ | Primary |
| Web NFC (`NDEFReader`) | Chrome on Android only | Best experience — tap, no aiming, works with gloves and in the dark |
| Native camera → URL | All | Free fallback; no app permission needed |
| Manual entry | All | Always available; scan is never the only path |

**OD-6** — phone camera only, or dedicated scanners? NFC is materially better in a barrel hall (no aiming, no light, works through a glove). Recommend NFC where the fleet is Android, QR everywhere as the baseline, and both printed on the same label.

### 3.3 Behaviour on read

| Context | Result |
|---|---|
| Inside a runner | **Sets the current position** to that member. Does not navigate away, does not lose entered state. If the tag is not a member of the current group, offer "Leave this round and open C-2201?" |
| Anywhere else in the app | Navigate to the object |
| Command palette open | Fill the query with the object and highlight it |
| Not signed in | Sign in, then continue to the object |

Feedback is a short "Tag read" chip naming the object, plus a haptic tick where available.

### 3.4 Failure states

Each has approved copy in `09-content-terminology.md` §7:

1. Camera permission denied → explain and offer manual entry.
2. Unreadable / damaged tag → retry and offer manual entry.
3. Unknown token → "That tag isn't in this winery's records" + search.
4. Token from another tenant → the same message. **Never** reveal that the object exists elsewhere.
5. NFC unsupported → fall back to QR silently; do not advertise a capability the device lacks.

### 3.5 Privacy and security

- Tokens are opaque and carry no tenant or object information.
- `/t/<token>` requires an authenticated session; an unauthenticated hit redirects to sign-in and preserves the target.
- Rate-limit token resolution to prevent enumeration. **⚠️ This infrastructure does not exist — see §3.5.1.**
- A tag can be **revoked and reissued** when a label is damaged or a barrel is renumbered; the old token then resolves to "This tag was replaced."

#### 3.5.1 ⚠️ PREREQUISITE — inbound rate limiting does not exist (owner decision attached)

**Verified on `91cd1dcd`: this codebase has no request rate-limiting primitive.** Every
`rateLimit` symbol in `src/` gates an **outbound** third-party API client, never an inbound route:

| Hit | What it actually is |
|---|---|
| [`src/lib/gis/satellite/client.ts`](src/lib/gis/satellite/client.ts) | outbound — satellite imagery API |
| [`src/lib/gis/satellite/token.ts`](src/lib/gis/satellite/token.ts) | outbound — imagery auth |
| [`src/lib/weather/providers/fetch-util.ts`](src/lib/weather/providers/fetch-util.ts) | outbound — weather providers |
| [`src/lib/knowledge/embed.ts`](src/lib/knowledge/embed.ts) | outbound — embedding API |
| [`src/lib/assistant/run.ts:400`](src/lib/assistant/run.ts:400) | `catch (e instanceof Anthropic.RateLimitError)` — **handling** Anthropic's outbound limit, not imposing one |

So **§3.5's rate-limit line requires building a piece of shared infrastructure this RFC does not
scope.** Left as-is, the enumeration requirement ships **unmet inside an approved RFC** — the
failure mode where a security control exists on paper only.

> [!important] ⚖️ OWNER DECISION REQUIRED — one of these three, explicitly.
> This is recorded as a **prerequisite with a decision attached**, not an implementation detail, so
> it cannot be silently skipped during Phase 10.
>
> | Option | Meaning |
> |---|---|
> | **A. Scope it as its own unit in Phase 10** | A shared inbound rate-limit primitive is built and `/t/<token>` is its first consumer. Phase 10 is the last of the four and depends on 7/8, so there is time. Other routes benefit later. |
> | **B. Defer it explicitly, with the residual risk accepted in writing** | Ship scan without a rate limit and accept that an authenticated user can probe the token space. §3.5.2's tenant-scoped read already caps the damage to *"does a token exist in MY tenant"*, which is a much smaller exposure than the requirement implies. |
> | **C. Remove the requirement from §3.5** | Only defensible if B's reasoning is accepted *and* written into the RFC — do not leave the line standing while not building it. |
>
> **Assessment (medium-high confidence).** The residual risk under B is genuinely modest: the
> resolver is auth-gated **and** tenant-scoped, so this is not open enumeration — it is an
> authenticated insider probing their own tenant's token space, and the tokens are opaque and
> revocable. **B is defensible; leaving the line unbuilt and unremarked is not.** What matters is
> that this is *chosen* rather than discovered during QA. I would not push back on any of the three.

#### 3.5.2 "Tenant-scoped" — say how, because the tempting implementation is wrong

§3.1 says tokens are tenant-scoped. The correct implementation is that the `/t/<token>` lookup is a
**tenant-scoped read** performed through the RLS-extended `prisma` client, so a foreign token simply
**returns nothing** and the "unknown tag" copy fires. That satisfies **AC-3 by construction** — the
refusal is indistinguishable from a genuinely-unknown token because the code cannot tell them apart
either.

The tempting alternative — a **global** token index, then compare `tenantId` in app code — violates
**`TENANT-1`** and leaks existence through timing (a found-then-rejected token takes a measurably
different path from a never-found one). Two consequences for the schema:

- The unique is **`@@unique([tenantId, tagToken])`**, *not* a global unique on `tagToken`. A global
  unique leaks cross-tenant existence through insert conflicts.
- The resolver must never use `prismaBase` or `$queryRaw` (**`TENANT-2`**: raw SQL bypasses the
  tenant extension). If raw SQL is needed, it goes through `runInTenantRawTx`.

State this in the plan; it is cheap to get right up front and expensive to retrofit.

### 3.6 Label production

Out of scope for this release (class E). The data model should not assume a particular label size or printer. Record `tagToken`, `tagIssuedAt` and `tagRevokedAt` so a print pipeline can be added later.

## 4. Unresolved decisions

0. **⚠️ NEW (2026-07-29) — the rate-limit prerequisite (§3.5.1): scope it, defer it knowingly, or
   remove the requirement.** *Owner decision required.* OD-6 itself is ready to ratify; this rides
   alongside it.
1. **OD-6** hardware answer. **Recommend: accept as written, with two conditions.** (a) Web NFC is
   built as a **progressive enhancement only**, never the assumed path — it is Chrome-on-Android
   only with no Safari implementation, so designing for it first makes the floor experience a
   function of which phone a seasonal worker owns. Design and QA the **iOS/camera** path first.
   (b) The §3.5.1 answer is on the record before Phase 10 starts. *(The data model — `tagToken`,
   `tagIssuedAt`, `tagRevokedAt` — survives review unchanged and keeps both a printer pipeline and
   a dedicated-scanner path open. Nothing here forecloses buying scanners later, which is what
   makes this low-regret.)*
2. Are racks taggable as well as barrels? A rack tag would let a crew scan once at the head of the rack and walk it, which is faster than 60 scans. Recommend yes.
3. Should scanning an *empty* barrel offer to fill it? Recommend yes, as a secondary action.
4. Do kegs get tags in v1? Recommend yes — it removes the only remaining picker in the topping flow.

## 5. Acceptance criteria

1. Scanning a barrel tag inside a topping runner sets the position without navigating or losing entered state.
2. Scanning outside a runner navigates to the object in under one second on a mid-range Android phone.
3. A tag from another tenant is refused with the same message as an unknown tag, and nothing about the other tenant is disclosed.
4. Every scan failure offers manual entry.
5. Manual entry reaches every object that a scan can reach.
6. Revoking and reissuing a tag leaves history intact and the old token explains itself.
7. Scan is never the only route to any object — verified by a keyboard-only pass with the camera disabled.
