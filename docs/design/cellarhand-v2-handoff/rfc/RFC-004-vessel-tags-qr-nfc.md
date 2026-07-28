# RFC-004 · Vessel tags — QR and NFC scan-to-context

**Status:** proposed · **Owner decision required:** OD-6 (hardware) · **Blocks:** the scan control, runner re-anchoring

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

Tokens are tenant-scoped. A tag from another winery resolves to a clear refusal, never to a foreign object.

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
- Rate-limit token resolution to prevent enumeration.
- A tag can be **revoked and reissued** when a label is damaged or a barrel is renumbered; the old token then resolves to "This tag was replaced."

### 3.6 Label production

Out of scope for this release (class E). The data model should not assume a particular label size or printer. Record `tagToken`, `tagIssuedAt` and `tagRevokedAt` so a print pipeline can be added later.

## 4. Unresolved decisions

1. **OD-6** hardware answer.
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
