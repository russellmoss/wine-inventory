# Council Feedback — Voice Focus, speaker recognition, and wake-word readiness
**Date**: 2026-07-08
**Plan**: `docs/plans/2026-07-08-047-feat-voice-focus-speaker-recognition-wake-word-plan.md`
**Reviewers**: Codex `gpt-5.4` (types + data layer + trust boundary), Gemini `gemini-3.1-pro-preview` (product logic + privacy + UX)

The council was told the prior eng-review findings (A1 no vendor, A2 TTS echo contamination, A3 compounded latency, A4 EnvelopeAad slot reuse, A5 MVCC "zeroize", T1 eval-gate) and asked to find what was **missed**. Both did. Neither dismissed the existing findings.

## Critical Issues

**C1 — The protected-mode gate sits on the client (Codex).** Unit 8/10 imply `/verify` returns a match result to `useVoiceSession.ts` and the *client* then decides whether `my_voice` may be disabled or `team_session` entered. That is bypassable — the server must never trust a client boolean. **Fix:** `/verify` mints a short-lived signed verification *receipt* bound to `tenantId|userId|voiceSessionId|focusMode|issuedAt|provider/model`; `set-voice-focus.ts` verifies the receipt server-side before any protected transition. Define this seam **before** Unit 10; it stays correct even if verification later moves client-side (Eagle/A1) — the client still can't self-authorize.

**C2 — Shared-device "walk-away" lockout (Gemini).** A cellar iPad is communal. User A enables `my_voice` and walks to a tank; User B (grape-covered hands) can neither be heard nor say "turn off speaker recognition" (that command itself requires a match). The voice UI is bricked for everyone but A until someone washes up and taps. **Fix:** an always-visible physical "Force open / anyone can talk" control on the overlay that bypasses `my_voice`; and after N consecutive unmatched sustained-speech bursts, have the assistant proactively offer to open the session. Field-reality twin of the eng-review's A3.

**C3 — False-reject voice-command trap (Gemini).** Colds, N95/respirators, PPE, changing tank acoustics all cause false rejects. The trapped enrolled user's instinct — "turn off speaker recognition" — is gated behind the very match that is failing. **Fix:** when listening was triggered by an explicit physical tap (or later wake word), suspend the biometric gate for mode-switch commands, OR let that command surface a UI prompt requiring a single physical tap to confirm. Never silently drop it.

**C4 — `VoiceProfile` schema incomplete for its own `provider` modes (Codex).** `provider = VENDOR_REF` is declared but there is no `providerProfileId`/`providerRef` field — only `embeddingCt`/`dekWrapped`, which are local-embedding-only. **Fix:** add a nullable provider reference field; make `status`, `provider`, and `defaultFocusMode` Prisma **enums** not freeform strings; state per-provider required fields explicitly. (Ties to A1: pick the seam first.)

**C5 — Biometric multi-tenant re-enrollment for consulting winemakers (Gemini).** `@@unique[tenantId,userId]` forces consulting winemakers and harvest labor (who span many orgs) to re-consent and re-enroll their biometric on **every** tenant. **Fix / open question:** biometrics belong to the human — consider a global (per-`userId`) identity embedding referenced by a tenant-scoped `VoicePreference` toggle. This contradicts the plan's "tenant-scoped like ComplianceReminderPreference" default and cuts against the Phase-12 all-tenant-scoped invariant + RLS story, so it needs an explicit ADR either way — not a silent assumption.

## Design Questions (answer before /work)

1. **Verification seam (A1, restated by both):** vendor API, on-device Eagle/ONNX (client seam), or a mocked adapter shipped behind the interface while UX is validated? Decide before Units 4/5/7 — it determines whether `/verify` even exists server-side.
2. **Server proof for protected transitions (C1):** what signed artifact does the assistant tool require? Define the receipt shape now.
3. **Biometric identity scope (C5):** per-tenant (Phase-12 default, forces re-enroll) vs per-user global embedding + tenant-scoped preference? Requires an ADR.
4. **`team_session` lifetime:** "expires when overlay closes" is too aggressive — the overlay opens/closes every turn, so team mode dies between each teammate's command. Persist until logout / device sleep / ~15 min inactivity instead?
5. **Persistent default via voice at all (Codex + Open Q4):** UI-only persistence may be the cleaner boundary — voice sets session-only mode; the Settings toggle owns the durable default. Avoids dragging confirmation semantics + stream-contract changes into the tool.
6. **Session boundary (Codex):** both the full-page assistant and `AssistantDock.tsx` can open voice — you need an explicit `voiceSessionId` or "session-only mode"/"recent match" are undefined.

## Suggested Improvements

- **Assistant event-contract change is unplanned (Codex).** "Persistent default → confirmation card" must flow through `src/lib/assistant/assistant-events.ts`, consumed by both `AssistantChat.tsx` and `useVoiceSession.ts`. Reuse the existing proposal/confirm event or add a variant, and update `test/assistant-events.test.ts`, `assistant-choice.test.ts`, `assistant-confirm.test.ts`.
- **Explicit tenant/user args, not ALS (Codex).** Assistant execution paths don't always have ALS tenant context (`calc-shared.ts` works around this; memory K12). Make the voice profile/preference/verify helpers take explicit `tenantId`+`userId`; don't hide tenant lookup in cached/server-only helpers.
- **Enroll contract mismatch (Codex).** Unit 5 says "short samples", Unit 6 says "3-sample enrollment". Pin ONE contract (single POST `samples[]` with typed per-sample results, or start/append/commit session protocol) to avoid drift across UI, route, tests.
- **Don't leak `{score, threshold}` to the browser (Codex).** Returns a biometric tuning oracle. Return coarse `matched|rejected|unavailable|timeout`; keep numeric scores server-only + redacted.
- **`lastVerifiedAt` hot-row footgun (Codex).** Don't write it on every barge-in burst during playback. Update only on enrollment/protected-action success, or keep "recent match" purely ephemeral in the signed receipt.
- **BIPA/biometric consent record (Gemini).** Add `consentAcceptedAt` + `consentVersion` to `VoiceProfile`; hard-block enrollment behind an explicit consent tap. A bare `ACTIVE` enum is legally insufficient for biometric collection.
- **Deletion must cascade preference (Gemini).** Deleting the profile while `defaultFocusMode = "my_voice"` leaves the next session pointing at a null profile. Atomically reset `defaultFocusMode = "open"` in the same tenant transaction as delete.
- **`my_voice` overlay must name the constraint (Gemini).** "Listening only to Dave" vs "Listening to anyone", not just an icon — bystanders on a wall-mounted tablet otherwise shout fruitlessly.
- **Naming/storage collision (Codex).** `AssistantChat.tsx` already has `VoiceMode = "converse"|"transcribe"` persisted at `assistant.voiceMode`. Use a distinct type name and distinct localStorage key for `VoiceFocusMode`.
- **Shared capability object (Codex).** Centralize `supportsVerification/supportsIsolation/supportsWakeWord` in `src/lib/voice/config.ts` so Settings, routes, session, and registry don't each branch on env presence and drift.
- **Defer `wakeWordEnabled` column** unless the UI is truly hard-gated off — otherwise dead state baked into migration history (Codex).
- **Unit 10 repo gates beyond eval-coverage (Codex).** Also touches `registry.ts`, `prompt.ts`, assistant-tool tests, and `scripts/verify-ai-native.mjs` / `docs/architecture/assistant-coverage.md` (generated — don't hand-edit).

## Lower-priority design questions
- Multiple embeddings per profile (`default` / `masked`) for respirator/PPE work? (Gemini)
- VAD "sustained speech-like" gate tunability for stutters / heavy pausing while reading a hydrometer — accessibility (Gemini).
- Cross-talk collision in open/team_session (two workers shout simultaneously) — queue or intent-fail? (Gemini)

## What the council did NOT dispute
Codex: "The earlier review's A4/A5-style concerns are directionally correct; I do not see one I would dismiss." Both accepted A1–A3. The Phase-12 singleton pattern itself (`@@unique[tenantId,userId]` + `@@index[tenantId]`) is fine and not an N+1 risk — the only dispute is whether *biometrics specifically* should be tenant-scoped (C5).

---
## Raw Response — Codex (gpt-5.4)

**CRITICAL**
- Unit 8 + Unit 10 leave the protected-mode gate in the wrong trust boundary. The plan implies `/api/assistant/voice/verify` returns a match result to `src/app/(app)/assistant/voice/useVoiceSession.ts`, then the client decides whether `my_voice` can be disabled or `team_session` entered. That is bypassable. Fix: the verify route must mint a short-lived signed verification receipt bound to `tenantId`, `userId`, `voiceSessionId`, `focusMode`, `issuedAt`, and provider/model metadata, and `src/lib/assistant/tools/set-voice-focus.ts` must verify that receipt server-side before allowing protected transitions.
- The proposed `VoiceProfile` model is incomplete for its own declared provider modes. `provider = VENDOR_REF` is listed, but there is no field for a vendor enrollment/profile identifier, only `embeddingCt` and `dekWrapped`, which only cover local sealed material. Fix: add a nullable `providerProfileId`/`providerRef`, make `status`, `provider`, and `defaultFocusMode` Prisma enums instead of freeform strings, and make the per-provider required fields explicit.
- Unit 10 introduces a new assistant interaction contract without updating the shared stream schema. "Persistent default -> confirmation card" has to flow through `src/lib/assistant/assistant-events.ts`, and both `src/app/(app)/assistant/AssistantChat.tsx` and `src/app/(app)/assistant/voice/useVoiceSession.ts` consume that union. The plan never calls that out. Fix: either reuse the existing proposal/confirm event shape or add a new event variant and update both consumers plus `test/assistant-events.test.ts`, `test/assistant-choice.test.ts`, and `test/assistant-confirm.test.ts`.
- Unit 4/5 helper signatures are underspecified for tenant resolution. This repo already documents that assistant execution paths do not always have ALS tenant context; `src/lib/assistant/tools/calc-shared.ts` works around that explicitly. Fix: make `getVoicePreference`, `saveVoicePreference`, `upsertVoiceProfile`, `deleteVoiceProfile`, and verification helpers take explicit `tenantId` and `userId`; do not hide tenant lookup inside cached/server-only helpers.
- Unit 5 and Unit 6 disagree on the enrollment contract. The UI says "3-sample enrollment"; the route says "accepts short samples." That is not type-safe enough to implement. Fix: define one contract now: either one POST with `samples[]` and a typed per-sample result, or an enrollment-session protocol (`start` / `append sample` / `commit`). Anything else will produce construction-site drift between settings UI, route handlers, and tests.

**SHOULD FIX**
- `src/app/(app)/assistant/AssistantChat.tsx` already has a `VoiceMode = "converse" | "transcribe"` and persists it under `assistant.voiceMode`. Adding `VoiceFocusMode = "open" | "my_voice" | "team_session"` without a separate type/key is asking for name collisions and wrong localStorage hydration. Fix: use distinct type names and distinct storage keys.
- `/api/assistant/voice/verify` should not return raw `{ score, threshold }` to the browser. That creates a biometric tuning oracle and is unnecessary for UX. Fix: return coarse client-safe states like `matched`, `rejected`, `unavailable`, `timeout`; keep numeric scores server-only and redacted.
- `lastVerifiedAt` on `VoiceProfile` is a likely hot-row footgun if you update it on every barge-in attempt. This path will execute during playback bursts. Fix: only update on enrollment or on a protected-action success, or keep "recent match" entirely ephemeral via the signed receipt.
- Unit 10 needs explicit repo-gate work beyond the new tool file. At minimum: `src/lib/assistant/registry.ts`, `src/lib/assistant/prompt.ts`, the assistant-tool tests, and `scripts/verify-ai-native.mjs` / `docs/architecture/assistant-coverage.md`. That is separate from the eval-coverage concern already raised.
- Add a shared capability object out of `src/lib/voice/config.ts` so Settings, routes, `useVoiceSession`, and the assistant registry all agree on `supportsVerification`, `supportsIsolation`, and `supportsWakeWord`. Right now the plan will otherwise branch on env presence in multiple places and drift.
- `wakeWordEnabled` in `VoicePreference` is only acceptable if the UI stays hard-gated off when no provider exists. If you intend to surface the toggle now, defer the column; otherwise you are baking dead state into Prisma and migration history.
- The Phase-12-style singleton pattern itself is fine. `VoicePreference` modeled like `ComplianceReminderPreference` is not the problem, and `@@unique([tenantId, userId])` plus `@@index([tenantId])` is sufficient for the expected one-row lookups. This is not an N+1 risk by itself.

**DESIGN QUESTIONS**
- What is the actual session boundary for `team_session` and "recent match"? The app has both the full-page assistant and `src/components/assistant/AssistantDock.tsx`. If both can open voice, you need an explicit `voiceSessionId`; otherwise "session-only mode" is undefined.
- If speaker verification moves client-side later, what proof does the server accept for protected assistant-tool transitions? You need that seam defined before Unit 10, not after, because the server cannot trust a client boolean regardless of provider choice.
- Should persistent default mode changes be voice-driven at all? Session-only mode changes fit the current assistant model. Persistent preference writes drag in confirmation semantics, stream-contract changes, and server-side verification proof. UI-only persistence may be the cleaner boundary.

The earlier review's A4/A5-style concerns are directionally correct; I do not see one I would dismiss. The bigger misses are the missing server-verification receipt, the incomplete `VoiceProfile` schema for provider-backed verification, and the unplanned assistant event-contract changes.

---
## Raw Response — Gemini (gemini-3.1-pro-preview)

Here is a rigorous review of the Voice Focus implementation plan. I am skipping the known issues (WASM vendor sourcing, TTS audio bleed, MVCC zeroization, compound barge-in latency) to focus purely on unmitigated domain, data, privacy, and UX risks.

### CRITICAL

**1. The Shared-Device "Walk-Away" Lockout**
*   **What's wrong:** Cellar iPads are highly communal. User A logs in, starts a task, turns on `my_voice`, and walks away to punch down a tank. User B walks up to the shared tablet with grape-covered hands to stop a pump or log an addition. Because the session is in `my_voice` tied to User A, the tablet entirely ignores User B. User B cannot even say "Turn off speaker recognition" because the plan states that command *requires a voice match*. The voice interface is effectively bricked for everyone except User A until someone washes their hands and physically touches the screen.
*   **Where:** Session modes & Protected voice commands.
*   **The Fix:**
    *   Provide a global, highly visible "Force Open" physical button on the voice overlay that bypasses `my_voice` immediately.
    *   If the VAD detects sustained speech but the speaker-match fails *three times in a row*, the assistant should proactively ask: *"I don't recognize that voice. Do you want to open the session to anyone?"* (Accepting "yes" from the unrecognized user to drop the gate to `team_session`).

**2. The False-Reject Voice Command Trap**
*   **What's wrong:** Cellar acoustics change (empty vs. full tanks), and workers get colds or wear PPE (N95s/respirators). If the pipeline false-rejects the enrolled user, the user will naturally try to say *"Turn off speaker recognition."* The plan requires this specific command to pass the very speaker match that is currently failing. The user is now trapped and cannot disable the feature by voice.
*   **Where:** Protected voice commands.
*   **The Fix:** If the user manually triggered the listening state via a physical tap (or the forthcoming wake-word), suspend the biometric gate for mode-switching commands. Alternatively, allow "Turn off speaker recognition" to trigger a UI prompt requiring a simple physical tap to confirm, rather than dropping the request silently.

**3. Multi-Tenant Re-enrollment Nightmare (Consulting Winemakers)**
*   **What's wrong:** The plan scopes `VoiceProfile` to `@@unique[tenantId, userId]`. The wine industry relies heavily on consulting winemakers and temporary harvest labor who belong to multiple organizations (tenants). You are forcing these users to read consent forms and re-enroll their voice biometric profile on every single tenant they switch to.
*   **Where:** Data Model.
*   **The Fix:** Biometrics belong to the *human*, not the winery. Scope `VoiceProfile` to the `userId` globally. If enterprise isolation policies demand tenant-scoping, keep `VoicePreference` (the toggle) tenant-scoped, but reference a global identity embedding so they only read the script and enroll once.

### SHOULD FIX

**1. BIPA / Biometric Consent Logging is Missing**
*   **What's wrong:** Storing biometrics (even local/edge embeddings) puts you in the crosshairs of strict biometric privacy laws like BIPA (Illinois). A simple `ACTIVE` enum is legally insufficient. You must prove *when* the user consented to biometric collection and to *which version* of the privacy policy.
*   **Where:** Data Model (`VoiceProfile`).
*   **The Fix:** Add `consentAcceptedAt` (timestamp) and `consentVersion` (string) to the `VoiceProfile` table. Enrollment must be hard-blocked until an explicit checkbox is tapped in the UI.

**2. State Mismatch on Profile Deletion**
*   **What's wrong:** The plan says "Deletion zeroizes ciphertext + disables profile." But what happens to the user's `VoicePreference.defaultFocusMode`? If they delete their profile, but their default mode remains `my_voice`, the next time they trigger a session, the app will either crash looking for a null profile, or fail closed.
*   **Where:** Data Model / Settings.
*   **The Fix:** Deleting the profile MUST atomically cascade to update `VoicePreference`, forcing `defaultFocusMode = "open"`.

**3. `team_session` Expiry is Too Aggressive**
*   **What's wrong:** "Expires when overlay closes." On a crush pad, a team might spend 20 minutes calling out gravity-flow volumes or lab titrations. The assistant overlay will open and close constantly between turns. If `team_session` expires on overlay close, it immediately reverts to `my_voice`, meaning the active user has to say "open team session" before *every single teammate's command*. That completely breaks team flow.
*   **Where:** Interaction Model.
*   **The Fix:** `team_session` should persist until the device goes to sleep, the user logs out, or 15 minutes of inactivity pass.

**4. Ambiguous "Listening" State on Shared Devices**
*   **What's wrong:** The UX notes specify a "compact focus indicator". If a shared iPad is mounted on a wall and is in `my_voice` mode, a bystander needs to know *who* it is listening for, otherwise they will shout at it fruitlessly.
*   **Where:** Settings > Voice (Design Notes).
*   **The Fix:** The overlay indicator cannot just be an icon. It must explicitly state the active constraint: *"Listening only to Dave"* vs *"Listening to anyone"*.

### DESIGN QUESTIONS

*   **PPE & Voice Drift:** Will cellar hands need a way to enroll a secondary "Respirator Voice"? High-end cellar work (e.g., ozone cleaning, confined space tank entry) requires masks that severely muffle formants. Can the `VoiceProfile` support multiple embeddings (e.g., `default`, `masked`)?
*   **Stuttering / Atypical Speech:** You mentioned a "sustained speech-like" gate for VAD. Have you tested this against users with stutters or those who pause heavily while reading a Brix hydrometer? Ensure the VAD threshold is tunable, or risk alienating neurodivergent/speech-impaired workers.
*   **Cross-Talk Resolution:** In `open` or `team_session` modes, what happens when a pump is running and two workers shout at the tablet simultaneously ("Log 50 gallons!" / "Wait, stop the pump!")? Does the pipeline queue them, or does the collision cause a total intent failure?
