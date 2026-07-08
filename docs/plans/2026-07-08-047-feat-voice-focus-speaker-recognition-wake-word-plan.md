---
title: Voice Focus, speaker recognition, and wake-word readiness
type: feat
status: draft
date: 2026-07-08
branch: feat/voice-focus-speaker-recognition
depth: deep
units: 13
reviews: eng-review / council / design-review complete; approve-with-changes
---

## Overview

Make Cellarhand voice mode usable in real cellar-floor conditions: music in the room, tools hitting tables, other people talking, and the assistant speaking out loud. The core change is a new Voice Focus pipeline that separates "noise happened" from "the active user is talking to me."

The plan ships in layers. First, fix false barge-in from non-speech sounds. Then add opt-in speaker recognition, session-level team mode, an assistant-controlled setting tool, and a wake-word architecture that can later support "Hey Cellarhand" without rewriting the voice stack.

**2026-07-08 update:** the foreground browser-speech/Picovoice prototype was disabled before release. Wake phrase implementation is now deferred to `2026-07-08-048-feat-openwakeword-onnx-wake-phrase-plan.md`.

## Problem Frame

Today voice mode treats any loud enough sound during assistant playback as an interruption. A desk tap, bottle clink, chair scrape, or music transient can stop the assistant mid-sentence and push it back into listening. That makes the assistant feel jumpy and unreliable.

The user need is not "biometric login." It is operational focus: when the assistant is talking, only intentional speech should interrupt it, and when speaker recognition is enabled, only the enrolled active user should be able to interrupt or control protected session settings.

If we do nothing, voice mode stays fragile in exactly the environment where it should shine: a noisy cellar, crush pad, lab bench, or office with music on.

## Requirements

- MUST: Assistant speech must not stop on a single loud sound spike.
- MUST: Barge-in must require sustained speech-like audio before interrupting playback.
- MUST: Speaker recognition must be opt-in and deletable by the user.
- MUST: Stored voice signature material must be tenant-scoped, RLS-forced, encrypted at rest, and never logged.
- MUST: Speaker recognition must be a confidence gate, not authentication. Login, RBAC, tenant scoping, and write confirmations remain authoritative.
- MUST: When Voice Focus is set to "my voice", barge-in and protected voice setting changes only trigger after the candidate clip matches the enrolled active user above threshold.
- MUST: A recognized enrolled user can say "turn off speaker recognition" or "switch to team mode" and the assistant can change the current voice session mode agentically.
- MUST: An unrecognized voice cannot disable speaker recognition by voice while protection is on.
- MUST: Team mode allows anyone nearby to talk to the assistant for the current session without deleting the user's enrolled profile.
- MUST: Write actions still use the existing signed-token / single-use confirmation path.
- MUST: Wake-word work is designed as an opt-in future layer, not turned into always-on background listening in this phase.
- SHOULD: Add optional ElevenLabs Voice Isolator preprocessing before transcription for noisy clips.
- SHOULD: Keep per-session Voice Focus state in the client, and persist the user's default mode in tenant-scoped preferences.
- SHOULD: Add a Settings > Voice surface for enrollment, mode defaults, deletion, and privacy copy.
- SHOULD: Add test fixtures for tap/clink/music/noise edge cases using synthetic or checked-in tiny audio fixtures where practical.
- NICE: Store calibration metadata such as recommended threshold, last enrollment quality score, and supported device/browser capability info.
- NICE: Prepare a wake-word provider interface for Porcupine/openWakeWord without selecting the final vendor in this PR.

## Scope Boundaries

**In scope:**
- Barge-in hardening in `src/lib/voice/vad.ts` and `src/app/(app)/assistant/voice/useMicCapture.ts`.
- Voice Focus state machine in `useVoiceSession.ts` and `VoiceOverlay.tsx`.
- Tenant-scoped `VoiceProfile` and `VoicePreference` tables, migrations, RLS, and isolation tests.
- Server routes/actions for enrollment, deletion, status, and speaker verification.
- Encrypted storage for speaker embeddings or provider reference IDs using `src/lib/crypto/envelope.ts`.
- Optional audio isolation preprocessing before STT.
- Assistant tool for session-scoped Voice Focus changes, gated by the current recognition state.
- Settings UI for voice enrollment and preference management.
- Wake-word architecture doc/code skeleton only if it helps avoid rework.

**Out of scope:**
- Treating voice recognition as login or MFA. It is too spoofable for that, and the app already has auth/RBAC.
- Removing tap or card confirmation for writes. Voice can say "confirm", but the existing token path stays in charge.
- Fully always-on background listening when the app is closed or suspended. Browser and mobile OS limits make that a PWA/native-wrapper project.
- Training or hosting a custom speaker embedding model unless no vendor/on-device option is acceptable. Prefer a small provider adapter behind an interface.
- Storing raw enrollment audio long-term. Raw samples should be discarded after embedding generation unless a later explicit product/legal decision says otherwise.
- Building wake-word UI beyond a future-facing disabled/hidden capability note. Wake word is a later phase after Voice Focus proves useful.

## Research Summary

### Codebase Patterns

- Voice capture lives in `src/app/(app)/assistant/voice/useMicCapture.ts`. It opens one persistent `getUserMedia` stream with `echoCancellation`, `noiseSuppression`, and `autoGainControl`, then computes RMS through an `AnalyserNode`.
- Current barge-in is too eager: `useMicCapture.ts` calls `onSpeech()` on the first `speech-start` event in barge mode. `VadDetector` in `src/lib/voice/vad.ts` emits `speech-start` on the first loud sample over `speechThreshold`.
- Current VAD is intentionally pure and tested in `test/voice-vad.test.ts`, which is the right place for new barge-in semantics.
- `src/app/(app)/assistant/voice/useVoiceSession.ts` owns the listen -> transcribe -> think -> speak -> listen loop. It starts barge-in monitoring when state flips to `speaking`.
- STT is server-side in `src/lib/voice/transcribe.ts` through `/api/assistant/transcribe`. This is the right choke point for optional audio isolation and transcript-level metadata.
- Voice config already centralizes vendor/env checks in `src/lib/voice/config.ts`, with tests in `test/voice-config.test.ts`.
- The assistant tool registry in `src/lib/assistant/registry.ts` already carries `lastUserMessage` and cleanly separates read/write tools. A new session-setting tool can follow this pattern.
- Assistant writes already require confirmation via `src/lib/assistant/confirm.ts` and `commit.ts`; voice confirm reuses the same path in `useVoiceSession.ts`.
- Settings UI is in `src/app/(app)/settings/SettingsClient.tsx` with server data loaded from `src/app/(app)/settings/page.tsx`; settings actions use `src/lib/settings/actions.ts`.
- Per-user tenant-scoped preference precedent exists in `ComplianceReminderPreference` with `@@unique([tenantId, userId])`.
- Assistant conversation tables are tenant-scoped even though they are user-owned. This is the correct pattern for voice profile/preference data too.
- Encryption helper `src/lib/crypto/envelope.ts` provides AEAD envelope encryption with AAD binding and key rotation support. Reuse this for encrypted embeddings/provider references.

### Prior Learnings

- Phase 12 tenant checklist applies to every new tenant-scoped domain/registry table: `tenantId`, index, migration FK/RLS, per-tenant uniques, app_rls grants, and isolation tests.
- Security register says personal data must stay out of immutable events, secrets must not hit client/logs, and assistant writes require explicit confirmation.
- Phase 15 accounting tokens established the envelope pattern: per-record DEK, env KEK, AAD-bound row identity, KMS-upgradable later.
- Voice mode QA already expects barge-in while the assistant is speaking, but the current behavior is too sensitive. We need to preserve intentional interruption while rejecting non-speech.

### External Research

- Browser media constraints can request noise suppression and echo cancellation, but browsers may ignore unsupported constraints and these features do not identify a speaker. MDN: `noiseSuppression` and `echoCancellation`.
- ElevenLabs Voice Isolator can remove background noise/music/ambient sound before STT. It is useful as cleanup, not speaker identity.
- ElevenLabs Scribe v2 supports diarization/speaker labels, useful for multi-speaker transcription, but diarization labels "speaker_0" style identities inside a clip; it does not by itself bind to a known enrolled user.
- Picovoice Porcupine and openWakeWord can support "Hey Cellarhand" style wake words. After prototype testing, the next implementation path is the separate openWakeWord ONNX plan rather than Picovoice.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Product framing | "Voice Focus" and "Recognize my voice", not "secure voice ID" | Market as biometric auth | It is an input-quality and consent feature, not security authentication. |
| Data model | Tenant-scoped `VoiceProfile` + `VoicePreference` keyed by `(tenantId,userId)` | Global user table; fields on `User`; AppSettings only | Honors Phase 12 and multi-org users; avoids a new non-RLS global table. |
| Stored data | Encrypted embedding/provider reference, no raw audio | Store WAV samples; store plaintext vectors | Reduces biometric data risk and aligns with existing envelope crypto. |
| Barge-in v1 | Sustained speech confirmation before interruption | Keep first loud sample; disable barge-in | Fixes desk taps without removing a valuable hands-free feature. |
| Recognition gate | Capture short candidate clip, verify, then interrupt if matched | Interrupt first then verify; block all barge-in | Avoids cutting off assistant for unrecognized voices/noise, at cost of a small delay. |
| Session modes | `open`, `my_voice`, `team_session` | One global boolean | Matches real use: solo cellar work vs shared room. |
| Agentic toggle | Tool can change session mode; persistent default changes require stronger confirmation | Voice can change account defaults freely | Prevents bystander takeover while still supporting "turn off recognition for now." |
| Audio isolation | Optional pre-STT cleanup behind config and timeout | Always isolate every clip | Avoids extra latency/cost unless enabled or noisy. |
| Wake word | Disabled provider interface and deferred openWakeWord ONNX implementation | Pick vendor and ship now; keep the browser-speech/Picovoice prototype | Keeps phase focused and avoids shipping unreliable foreground wake detection. |

## Post-Review Revisions

The eng-review, council, and design-review passes agree this is worth building, but it should not move to `/work` until the following revisions are treated as implementation constraints:

1. Add Unit 0: speaker-verification provider spike. Decide the v1 verification seam before Units 4, 5, and 7. Picovoice Eagle or a similar on-device verifier is likely preferable if it keeps `my_voice` barge-in latency acceptable. ElevenLabs Voice Isolator remains an audio cleanup option, not speaker identity.
2. Treat Voice Focus as UX safety, not auth. If any protected transition is evaluated server-side, `/verify` must mint a short-lived signed verification receipt bound to `tenantId`, `userId`, `voiceSessionId`, focus mode, issued time, provider, and model version. Server tools must verify that receipt instead of trusting client state.
3. Preserve a physical escape hatch. The overlay must always expose an "Open to anyone" control that can be tapped/clicked even when `my_voice` is rejecting voices. After two unmatched speech bursts, prompt with "Open to anyone?" so a shared tablet is not locked to someone who walked away.
4. Let tap-triggered recovery bypass the biometric gate for mode changes. If the user physically opens the mic or wake-trigger state is explicit, mode-switch commands such as "turn off speaker recognition" should be allowed through a visible confirmation instead of being trapped behind a failing voice match.
5. Keep biometric storage tenant-scoped for v1 unless an ADR explicitly approves a global biometric table. The default recommendation is tenant-scoped `VoiceProfile` plus tenant-scoped `VoicePreference`, accepting that multi-org consultants may re-enroll per organization to stay aligned with Phase 12.
6. Tighten the schema: use Prisma enums for profile status, provider, and default focus mode; add nullable `providerRef` for vendor-backed profiles; add consent fields (`consentAcceptedAt`, `consentVersion`); and reset preference defaults to `open` when a profile is deleted or disabled.
7. Use the existing envelope crypto carefully. Bind AAD to the voice record identity using distinct `table`/`provider` values and the profile id in the row-identity slot. Add a transplant test so encrypted voice material cannot be moved across tenants/users/profiles.
8. Define the enrollment API contract before UI work. Prefer one `POST` that accepts three enrollment samples and returns per-sample quality feedback plus a final profile status, unless the provider requires a start/append/commit flow.
9. Make team mode expire predictably. Use explicit "Open to anyone for this session" language, plus inactivity/device-sleep/logout expiry. Overlay close alone is not enough for shared cellar devices.
10. Pin UX copy and states in the plan before build: env unconfigured, mic denied, first/second/third sample, verifying, failed quality, needs re-enroll, delete pending, deleted, and no-profile defaults. All controls need keyboard/tap access, 44px touch targets, and `aria-live` status updates.
11. Add assistant event coverage for the mode-switch tool. The assistant must distinguish `voice_focus_mode_changed`, `voice_focus_mode_rejected_unmatched`, `voice_focus_profile_missing`, and `voice_focus_confirmation_required` so golden evals can verify the behavior.

## Interaction Model

Voice Focus modes:

| Mode | Meaning | Barge-in behavior | Who can change it by voice |
|------|---------|-------------------|----------------------------|
| `open` | Anyone can talk in this session | Sustained speech interrupts | Any signed-in session user |
| `my_voice` | Only enrolled active user should control the session | Sustained speech plus speaker match interrupts | Only matched enrolled user |
| `team_session` | Temporarily let nearby teammates talk | Sustained speech interrupts | Any signed-in session user, expires when overlay closes |

Protected voice commands:

- "Turn on speaker recognition" sets current session to `my_voice` if the active user has an enrolled profile.
- "Turn off speaker recognition" sets current session to `team_session`, but only if the candidate voice matched while protection is active.
- "Make this my default" or "always use my voice" changes persistent preference only after a visible confirmation card or settings action.
- "Delete my voice profile" never runs silently from voice alone; it opens/announces the Settings action and requires tap confirmation.

Candidate barge-in pipeline:

```text
assistant speaking
  |
  v
mic hears audio over threshold
  |
  v
speech gate: sustained speech-like audio?
  | no -> keep speaking
  | yes
  v
mode open/team_session? -> interrupt and listen
  |
  v
mode my_voice? -> capture short candidate clip
  |
  v
speaker match above threshold?
  | no -> keep speaking, optionally lower sensitivity for this burst
  | yes -> stop playback and listen
```

## Data Model

New Prisma models, names tentative:

- `VoiceProfile`
  - `tenantId String @default("")`
  - `id String @id @default(cuid())`
  - `userId String`
  - `status String` (`ACTIVE`, `DISABLED`, `NEEDS_REENROLL`)
  - `provider String` (`LOCAL_EMBEDDING`, `VENDOR_REF`, later provider names)
  - `embeddingCt String?`
  - `dekWrapped String?`
  - `modelVersion String`
  - `threshold Float`
  - `enrollmentQuality Float?`
  - `createdAt DateTime @default(now())`
  - `updatedAt DateTime @updatedAt`
  - `lastVerifiedAt DateTime?`
  - `@@unique([tenantId, userId])`
  - `@@index([tenantId])`

- `VoicePreference`
  - `tenantId String @default("")`
  - `id String @id @default(cuid())`
  - `userId String`
  - `defaultFocusMode String @default("open")`
  - `audioIsolationEnabled Boolean @default(false)`
  - `wakeWordEnabled Boolean @default(false)` (future/off until implementation)
  - `updatedAt DateTime @updatedAt`
  - `@@unique([tenantId, userId])`
  - `@@index([tenantId])`

Migration must follow the Phase 12 checklist:

- Add `tenantId`, index, FK to `organization(id)` with `ON DELETE RESTRICT`.
- Enable and force RLS.
- Add tenant isolation policy with `USING` and `WITH CHECK` on `current_setting('app.tenant_id', true)`.
- Add app_rls DML grants.
- Add cases to `scripts/verify-tenant-isolation.ts` and `test/tenant-isolation.test.ts`.
- Do not add these models to `GLOBAL_MODELS`.

Biometric handling:

- Do not store raw enrollment audio after embedding generation.
- Seal the embedding or provider reference with `src/lib/crypto/envelope.ts`.
- AAD must bind `table|provider|environment|tenantId|profileId|fieldName|kid`.
- Redact `embeddingCt`, `dekWrapped`, raw audio names, provider response bodies, and verification scores from logs/Sentry.

## Implementation Units

### Unit 1: Barge-in VAD hardening

**Goal:** Stop random clicks/clinks/taps from interrupting assistant speech.
**Files:** `src/lib/voice/vad.ts`; `src/app/(app)/assistant/voice/useMicCapture.ts`; `test/voice-vad.test.ts`.
**Approach:** Extend VAD with a "speech-confirmed" event after sustained loud audio, separate from first onset. In barge mode, trigger only on confirmed speech. Keep listen-mode finalization behavior compatible with existing tests.
**Tests:** First loud sample emits onset but not confirmation; 80ms tap never confirms; 400ms speech confirms; finalization still works; reset clears confirmed state.
**Depends on:** none.
**Patterns to follow:** Existing pure `VadDetector` tests in `test/voice-vad.test.ts`.
**Verification:** Voice VAD tests pass, and manual desk-tap during playback no longer stops speech.

### Unit 2: Voice Focus session state machine

**Goal:** Add explicit session modes without changing persistence yet.
**Files:** `src/app/(app)/assistant/voice/useVoiceSession.ts`; `src/app/(app)/assistant/voice/VoiceOverlay.tsx`; `src/lib/voice/focus.ts` (new); tests as needed.
**Approach:** Introduce `VoiceFocusMode = "open" | "my_voice" | "team_session"` and a small reducer that handles mode changes, expiry, and match-required decisions. Default to `open` until Unit 6 loads preferences. Overlay shows compact status and gives tap controls.
**Tests:** Reducer tests for mode transitions, team mode expiry on stop/close, and "my_voice requires profile" fallback.
**Depends on:** Unit 1.
**Patterns to follow:** `useVoiceSession.ts` state refs and `VoiceOverlay.tsx` compact state labels.
**Verification:** Voice overlay still starts/stops, with no behavior change in default `open` mode.

### Unit 3: Tenant-scoped voice schema and RLS

**Goal:** Persist opt-in profiles and preferences safely.
**Files:** `prisma/schema.prisma`; new migration under `prisma/migrations/`; `scripts/verify-tenant-isolation.ts`; `test/tenant-isolation.test.ts`.
**Approach:** Add `VoiceProfile` and `VoicePreference` with the Phase 12 checklist. Treat both as tenant-scoped per-user tables, similar to `ComplianceReminderPreference`.
**Tests:** Tenant A cannot read/update Tenant B profile/preference; WITH CHECK rejects cross-tenant create; `@@unique([tenantId,userId])` prevents duplicates inside one tenant.
**Depends on:** none.
**Patterns to follow:** `ComplianceReminderPreference`; assistant conversation tenant scoping; Phase 12 checklist in `AGENTS.md`.
**Verification:** Tenant isolation suite includes both new models.

### Unit 4: Voice profile crypto and data helpers

**Goal:** Seal, open, create, delete, and read voice profiles through a narrow server-only API.
**Files:** `src/lib/voice/profile.ts` (new); `src/lib/voice/profile-crypto.ts` (new); `test/voice-profile-crypto.test.ts`; `test/voice-profile.test.ts`.
**Approach:** Wrap `src/lib/crypto/envelope.ts` with voice-specific AAD. Expose server-only helpers: `getVoicePreference`, `saveVoicePreference`, `upsertVoiceProfile`, `deleteVoiceProfile`, `getEncryptedVoiceProfileStatus`. Never return plaintext embeddings to client components.
**Tests:** AAD mismatch fails; tenant/profile/field transplant fails; delete zeroizes encrypted material; missing KEK fails closed; read status hides ciphertext.
**Depends on:** Unit 3.
**Patterns to follow:** `src/lib/accounting/connection.ts` and `src/lib/accounting/token.ts`.
**Verification:** Crypto and helper unit tests pass without DB secrets in output.

### Unit 5: Enrollment and deletion routes/actions

**Goal:** Let users enroll and delete their own Voice Focus profile from Settings.
**Files:** `src/app/api/assistant/voice/enroll/route.ts` (new); `src/app/api/assistant/voice/profile/route.ts` (new); `src/lib/voice/enrollment.ts` (new); `src/lib/voice/config.ts`; route tests.
**Approach:** Auth-gate all routes with `getCurrentUser`. Enrollment accepts short recorded samples, runs embedding/provider enrollment, seals the result, and discards raw audio. Deletion zeroizes profile ciphertext and disables the profile. Return status/quality only, not embeddings.
**Tests:** 401 unauthenticated; 400 missing/oversized audio; enrollment disabled when provider/env missing; success stores encrypted profile; delete removes encrypted material; no raw audio retained.
**Depends on:** Unit 4.
**Patterns to follow:** `/api/assistant/transcribe` request validation; accounting connect route auth gates.
**Verification:** Enrollment route tests pass with mocked embedding provider.

### Unit 6: Settings UI for Voice Focus

**Goal:** Give users explicit control over enrollment, default mode, audio isolation, and deletion.
**Files:** `src/app/(app)/settings/page.tsx`; `src/app/(app)/settings/SettingsClient.tsx`; `src/components/ui/*` only if existing components are insufficient.
**Approach:** Add a "Voice" section using existing Button/Card/Badge/Input patterns and DESIGN.md tokens. Include a short enrollment flow with 3 sample prompts, quality feedback, default mode selection, audio isolation toggle, and destructive delete confirmation. Keep copy plain and privacy-forward.
**Tests:** Component-level tests if existing harness supports it; otherwise route/action tests plus manual browser QA after implementation.
**Depends on:** Units 4 and 5.
**Patterns to follow:** Existing Settings sections; Button/Card/Badge components; sentence-case labels.
**Verification:** Settings loads without voice env configured; enrolled/unenrolled states render; deletion requires explicit confirm.

### Unit 7: Speaker verification service

**Goal:** Decide whether a candidate clip sounds like the enrolled active user.
**Files:** `src/lib/voice/speaker-verify.ts` (new); `src/app/api/assistant/voice/verify/route.ts` (new); `test/voice-speaker-verify.test.ts`.
**Approach:** Create provider interface `SpeakerVerifier` with a mocked deterministic implementation for tests and a production adapter selected by env. Inputs are short candidate audio clips; output is `{ matched, score, threshold, reason }`. Do not include raw score in client-visible copy when not needed.
**Tests:** No profile -> `matched:false`; disabled profile -> false; score >= threshold -> true; score below threshold -> false; provider timeout -> false with retry-safe reason; logs are redacted.
**Depends on:** Unit 4.
**Patterns to follow:** `src/lib/voice/transcribe.ts` vendor wrapper shape.
**Verification:** Tests cover match/no-match/timeout/misconfig.

### Unit 8: Recognition-gated barge-in

**Goal:** In `my_voice` mode, only stop assistant playback when the candidate speech matches the enrolled user.
**Files:** `src/app/(app)/assistant/voice/useMicCapture.ts`; `src/app/(app)/assistant/voice/useVoiceSession.ts`; `src/lib/voice/focus.ts`; route usage from Unit 7.
**Approach:** Add a barge-candidate mode: after confirmed speech, record a short clip while playback continues or is gently ducked; call verify; interrupt only on match. Guard against repeated verification loops by adding cooldown/backoff after rejected bursts.
**Tests:** Hook/state tests with mocked mic/verify if practical; pure reducer tests for rejected burst cooldown and matched interruption; manual QA with tap, music, other voice, enrolled voice.
**Depends on:** Units 1, 2, and 7.
**Patterns to follow:** Existing `turnRef` supersession and abort behavior in `useVoiceSession.ts`.
**Verification:** Assistant keeps speaking through desk taps and unrecognized voices in `my_voice`; recognized user can interrupt.

### Unit 9: Audio isolation preprocessing

**Goal:** Improve transcription quality in noisy clips without making every turn slow by default.
**Files:** `src/lib/voice/isolation.ts` (new); `src/lib/voice/transcribe.ts`; `src/lib/voice/config.ts`; `test/voice-isolation.test.ts`; `test/voice-transcribe.test.ts`.
**Approach:** Add an optional preprocessing step before STT, controlled by user preference and env. Use timeout and fallback: if isolation fails, continue with original audio unless configured fail-closed for test/dev diagnostics. Bound file size and duration before forwarding.
**Tests:** Isolation disabled bypasses provider; enabled success passes cleaned blob to STT; provider failure falls back; oversized audio rejected before isolation; no raw provider detail leaks to client.
**Depends on:** Unit 4 for preferences, but can be built after Unit 5.
**Patterns to follow:** `transcribeAudio` raw fetch wrapper and route max-size validation.
**Verification:** Existing transcription tests still pass; new isolation tests cover fallback.

### Unit 10: Assistant tool for session Voice Focus changes

**Goal:** Let the assistant change Voice Focus agentically within safe boundaries.
**Files:** `src/lib/assistant/tools/set-voice-focus.ts` (new); `src/lib/assistant/registry.ts`; `src/lib/assistant/prompt.ts`; `src/app/(app)/assistant/voice/useVoiceSession.ts`; tests.
**Approach:** Add a read/session tool, not a persistent write tool, for `set_voice_focus_mode`. The client sends current focus state and latest recognition result with the voice turn. Tool may set `open` or `team_session` freely only when current mode is not protected; in `my_voice`, disabling requires a recent match from Unit 8. Persistent default changes route to a confirmation card/settings action, not silent tool mutation.
**Tests:** Tool refuses unrecognized disable while protected; accepts disable after recent match; refuses persistent default change without confirmation; prompt says Voice Focus is not authentication.
**Depends on:** Units 2 and 8.
**Patterns to follow:** Assistant registry; proposal safety language; existing voice confirm/cancel path.
**Verification:** Saying "turn off speaker recognition" in protected mode only works for matched active user.

### Unit 11: Wake-word provider architecture

**Goal:** Prepare for "Hey Cellarhand" without shipping always-on listening yet.
**Files:** `src/lib/voice/wake-word.ts` (new); `docs/assistant-voice-mode-qa.md`; maybe `src/lib/voice/config.ts`.
**Approach:** Define a provider interface and capability flags: browser-supported, provider configured, requires foreground tab, requires user gesture, battery implications. Keep `wakeWordEnabled` preference inert until a later implementation plan wires Porcupine/openWakeWord.
**Tests:** Capability helper tests; config reports disabled by default.
**Depends on:** Unit 3 for preference field.
**Patterns to follow:** `voiceEnabled()` config gating.
**Verification:** No wake-word code starts a mic stream in this phase.

### Unit 12: QA fixtures and manual voice checklist

**Goal:** Prove this behaves in the real failure modes that triggered the plan.
**Files:** `docs/assistant-voice-mode-qa.md`; `test/voice-*.test.ts`; optional `test/fixtures/audio/*` if tiny fixtures are acceptable.
**Approach:** Add manual scenarios: desk tap during assistant speech, music playing, another speaker interrupting, enrolled user interrupting, protected disable attempt by bystander, recognized disable to team mode, audio isolation on/off, settings deletion.
**Tests:** Add synthetic VAD fixtures and provider mocks. Keep real audio fixtures tiny and non-identifying if added.
**Depends on:** Units 1-10.
**Patterns to follow:** Existing `docs/assistant-voice-mode-qa.md`.
**Verification:** Manual QA checklist completed on Chrome and one Safari/Edge pass if available.

### Unit 13: Security register and release documentation

**Goal:** Make the biometric/privacy posture durable for future contributors.
**Files:** `docs/architecture/security-register.md`; `docs/architecture/system-map.md`; `.env.example`; `AGENTS.md` if env/process notes are needed.
**Approach:** Add a security invariant for voice biometrics: opt-in, encrypted, tenant-scoped, deletable, not auth, no raw audio retention, no logs. Document env variables for provider selection, audio isolation, and wake-word disabled default.
**Tests:** Documentation review plus grep checks for new env names and Sentry redaction coverage if implemented.
**Depends on:** Units 3-11.
**Patterns to follow:** Security register entries for QBO token encryption and Commerce7 PII minimization.
**Verification:** Docs reflect final implementation and no secret/biometric fields are client-exposed.

## Test Strategy

**Unit tests:**
- `test/voice-vad.test.ts`: sustained speech confirmation, tap rejection, finalization regression.
- `test/voice-profile-crypto.test.ts`: envelope AAD, tamper, tenant/profile transplant rejection.
- `test/voice-speaker-verify.test.ts`: match/no-match/timeout/misconfig.
- `test/voice-isolation.test.ts`: provider success/fallback/disabled.
- `test/voice-config.test.ts`: new env gates.
- Assistant tool tests for `set_voice_focus_mode`.

**Integration tests:**
- `test/tenant-isolation.test.ts`: `VoiceProfile` and `VoicePreference` RLS.
- Route tests for enroll/profile/verify endpoints.
- Assistant voice session tests with mocked fetches for verify/transcribe/speak.

**Manual verification:**
- Start voice mode in `open`: sustained speech interrupts, desk tap does not.
- Enroll voice in Settings: status changes to active and raw samples are not retained.
- Set `my_voice`: desk tap does not interrupt; music does not interrupt; another person speaking does not interrupt; enrolled user speaking interrupts.
- Say "turn off speaker recognition" as unrecognized voice: refused or ignored.
- Say "turn off speaker recognition" as recognized user: session switches to team mode.
- With team mode active: another person can speak for this session.
- Close and reopen overlay: team mode expires; persisted default applies.
- Delete profile: `my_voice` becomes unavailable and profile status/ciphertext is gone.

## Failure Modes

| Failure mode | Test coverage | Error handling | User outcome |
|--------------|---------------|----------------|--------------|
| Desk tap crosses RMS threshold | Unit 1 VAD tests | Confirmation delay rejects it | Assistant keeps speaking |
| Music vocal triggers VAD | Manual QA + optional fixture | Speaker gate rejects if `my_voice` | Assistant keeps speaking |
| Recognition provider times out | Unit 7 tests | Treat as no match, do not interrupt | Assistant keeps speaking; status may say couldn't verify |
| Enrolled user cannot interrupt due to threshold too strict | Manual QA | Settings can reset/re-enroll; threshold stored per profile | User sees guidance, not silent failure |
| Bystander says "turn off speaker recognition" | Unit 10 tests | Tool requires recent match while protected | Request refused |
| Raw enrollment audio accidentally logged | Route tests + grep/Sentry redaction | Redaction and no raw storage | No sensitive audio in logs |
| Cross-tenant profile access | Tenant isolation tests | RLS fail-closed | No leak |
| Audio isolation adds latency | Unit 9 timeout tests | Timeout fallback to original audio | Slightly lower quality, not stuck |
| Wake-word preference accidentally starts mic | Unit 11 tests | Capability disabled by default | No always-on behavior in this phase |

## Performance and Latency Budget

- Barge-in confirmation adds roughly 300-500ms before interruption. That is acceptable because it avoids false stops during assistant speech.
- Speaker verification should use a short candidate clip, target under 700ms service time, and hard timeout around 1500ms.
- Audio isolation should be optional because it can add cost and delay. Timeout and fallback are mandatory.
- Enrollment can be slower; it is a Settings flow, not a live conversational turn.

## Privacy and Security

- Voice Focus is opt-in per active tenant/user.
- The UI must say it helps Cellarhand recognize when you are speaking; it is not a security feature.
- Raw enrollment audio is transient and deleted after embedding generation.
- Encrypted embedding/provider reference uses the existing envelope helper.
- AAD binds tenant, profile id, provider, environment, and field.
- Delete zeroizes encrypted material and disables the profile in one tenant transaction.
- Do not put embedding, raw audio, provider response bodies, scores, or ciphertext in assistant messages.
- Do not use `runAsSystem` in HTTP routes.
- Do not add these models to global model denylist.
- Add Sentry/log redaction for new sensitive field names.

## Design Notes

- Settings surface is operational app UI, not a landing page.
- Reuse existing `Button`, `Card`, `Badge`, `Input`, and `ConfirmButton` where possible.
- Use DESIGN.md tokens only: warm paper surfaces, wine accent, sentence-case labels.
- Avoid feature-explainer walls. The section should be scannable:
  - status badge: Not enrolled / Active / Needs re-enrollment
  - primary action: Set up voice recognition / Re-enroll
  - default mode selector: Open / My voice
  - toggle: Audio isolation
  - destructive action: Delete voice profile
- Voice overlay should show a compact focus indicator, not a settings panel.
- Use plain privacy copy: "Voice recognition helps decide who can interrupt this voice session. It does not replace sign-in or confirmations."

## Wake Word Future Plan

Future "Hey Cellarhand" should be a separate plan after Voice Focus ships. Expected direction:

- Use on-device keyword spotting where possible.
- Run only while the app/overlay/PWA is active unless a native wrapper exists.
- Wake word opens the existing voice loop and can greet with the active user's first name from the signed-in session.
- If Voice Focus is `my_voice`, wake activation should still require speaker match before privileged session changes.
- Provide an obvious listening indicator and a hard off switch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Speaker recognition feels laggy | MED | MED | Keep candidate clips short, set timeouts, show subtle verifying state only if needed |
| False reject frustrates enrolled user | MED | HIGH | Re-enrollment, threshold calibration, fallback tap interrupt |
| False accept lets nearby person interrupt | MED | MED | Do not treat as auth; keep writes confirmed; tune threshold conservatively |
| Biometric privacy mishandled | LOW | CRITICAL | Encrypt, no raw retention, delete controls, RLS, redaction, security register |
| Vendor API unavailable | MED | MED | Fail as no-match; keep open/team mode usable; expose config status |
| Browser mic constraints vary | HIGH | LOW | Capability checks and graceful fallback |
| Wake-word scope creeps into always-on background listening | MED | HIGH | Keep wake-word inert in this phase; document separate plan |

## Success Criteria

- [ ] Desk taps/clicks do not stop assistant speech.
- [ ] Sustained speech still interrupts in open/team mode.
- [ ] In `my_voice`, only enrolled active user interruptions stop playback.
- [ ] Unrecognized voices cannot disable speaker recognition by voice.
- [ ] Recognized user can switch to team mode by voice for the session.
- [ ] Voice enrollment and deletion work from Settings.
- [ ] Voice profiles/preferences are tenant-scoped, RLS-forced, and verified.
- [ ] No raw enrollment audio is retained after enrollment.
- [ ] Encrypted voice material is never sent to the client or logs.
- [ ] Existing assistant write confirmation path is unchanged.
- [ ] Wake-word preference remains disabled/inert until a later implementation.

## Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| VAD/session hardening | `src/lib/voice`, assistant voice client | none |
| Schema/security | `prisma`, tenant tests, crypto helpers | none |
| Enrollment/profile routes | `src/lib/voice`, `src/app/api/assistant/voice` | Schema/security |
| Settings UI | `src/app/(app)/settings`, UI components | Enrollment/profile |
| Assistant tool | `src/lib/assistant`, voice client | Session state + verification |
| Audio isolation | `src/lib/voice`, transcription route | Profile preferences |
| Wake-word skeleton/docs | `src/lib/voice`, docs | Schema preference |

Parallel lanes:

- Lane A: VAD/session hardening -> recognition-gated barge-in.
- Lane B: Schema/RLS/crypto -> enrollment/profile routes.
- Lane C: Audio isolation, after preference helper exists.
- Lane D: Settings UI, after profile routes exist.
- Lane E: Assistant tool, after session state and verification exist.
- Lane F: Wake-word skeleton/docs, after schema fields exist.

Execution order: start Lane A and Lane B in parallel. Merge B before D/C. Merge A+B before E. Run final QA/docs after all lanes merge.

Conflict flags: Lane A and Lane E both touch `useVoiceSession.ts`; coordinate or keep sequential after A lands.

## Confidence Check

| Section | Confidence | Notes |
|---------|------------|-------|
| Problem Frame | HIGH | User supplied concrete failure mode and desired behavior. |
| Scope Boundaries | HIGH | Voice Focus is separated from wake-word and auth. |
| Implementation Units | MEDIUM | Provider choice for speaker embeddings remains abstract by design. |
| Test Strategy | HIGH | Most core logic can be pure/mocked; manual audio QA still required. |
| Risk Assessment | HIGH | Main risks are privacy, false accept/reject, and latency, all called out. |

## Review Log

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture, security, tests | 1 | APPROVE_WITH_CHANGES | 6 issues (A1-A5, T1): provider seam, playback contamination, latency, envelope AAD, erasure wording, assistant eval gate |
| Council | `/council` | Cross-model adversarial review | 1 | APPROVE_WITH_CHANGES | 5 new criticals (C1–C5) + ~12 should-fix; see Council Synthesis + council-feedback.md |
| Design Review | `/plan-design-review` | Settings/voice UX plan | 1 | APPROVE_WITH_CHANGES | score 5→8; 7 findings (DR1–DR7, 3 HIGH) + 4 deferred; see Design Review Findings |
| Live Design QA | `/design-review` | Implemented visual QA | 0 | deferred | Run after UI exists; live design-review requires rendered screens. |

## Open Questions

1. Which speaker verification provider should v1 use: vendor API, local ONNX embedding, or a temporary mocked adapter behind the interface while we validate UX?
2. What confidence threshold is acceptable for barge-in: conservative false-reject bias, or easier interruption with slightly more false accepts?
3. Should audio isolation default on after enrollment, or remain a separate opt-in because of latency/cost?
4. Should persistent default mode changes from voice ever be allowed, or always require Settings/tap confirmation?

## Eng Review Findings (2026-07-08, autonomous)

Grounded against the live voice stack: `src/lib/voice/{vad,config,transcribe}.ts`,
`src/app/(app)/assistant/voice/{useMicCapture,useVoiceSession}.ts`,
`src/lib/crypto/envelope.ts`, and `ComplianceReminderPreference` in `prisma/schema.prisma`.
All codebase claims in the plan verified accurate. The layering, Phase-12 checklist coverage,
tenant-scoping decision, envelope reuse, and parallelization lanes are sound. The plan is
approvable with the following addressed. Findings are ordered by blast radius.

### A1 [P1] (confidence 8/10) — Speaker verification has no vendor, and it may not be a server route at all

Open Question 1 is not a detail; it is load-bearing for Units 4, 5, and 7. The single existing
voice key is ElevenLabs, and the plan itself confirms Scribe diarization does not bind to an
enrolled identity. So today there is **no** provider that satisfies `SpeakerVerifier`. Ship as
planned and `my_voice` mode is a UI + enrollment flow with a mock behind it — non-functional in
prod.

The natural fit is **Picovoice Eagle** (on-device speaker recognition, same vendor family as the
Porcupine wake word in Unit 11). Eagle runs in-browser via WASM. That is not a swap of one adapter
for another — it moves the verification seam from **server** (`/api/assistant/voice/verify`,
Unit 7) to **client**, which:
- collapses the per-turn network round trip (see A3),
- means raw enrollment audio and the embedding can be generated **client-side** so raw audio never
  leaves the browser (strictly better than the plan's "discard raw audio server-side after
  embedding"),
- changes what the server stores and seals (Unit 4 seals an embedding produced on the client, not
  a vendor reference).

**Recommendation:** Decide the provider/seam *before* building Units 4/5/7, or you risk building a
server verify route and server-side crypto helpers that get reworked when Eagle-in-browser turns out
to be the answer. Keep the `SpeakerVerifier` interface (good), but spike Eagle-in-browser first and
let the result pick the seam. If a server vendor is truly required, name it here — do not leave it as
"selected by env" with no candidate.

### A2 [P1] (confidence 8/10) — Candidate clip captured during playback is contaminated by the assistant's own voice

Cellar-floor reality is open speakers, not headphones. `useMicCapture.ts` opens the mic with
`echoCancellation: true`, but browser AEC is tuned for headset/laptop echo, not a PA over crush-pad
noise. While the assistant is speaking (`useVoiceSession.ts` `speak()` → `mic.beginBargeIn`), any
candidate clip recorded for `my_voice` verification (Unit 8) will contain a **mix of the enrolled
user + the assistant's TTS voice**. Speaker verification on that mixed clip biases toward false
reject for the one person the feature is supposed to serve. "Gently ducked" (Unit 8) reduces but
does not remove it on open speakers.

This failure mode is absent from the Failure Modes table and the Unit 12 QA checklist. It is the
single most likely reason `my_voice` "doesn't work" in the field.

**Recommendation:** Add it explicitly. Options to design in now: (a) briefly pause/duck playback to
near-silent during the candidate window, not just lower it; (b) prefer a headset-detected path;
(c) accept a slightly longer confirm and capture the clip in a short playback gap between sentences
(the sentence-chunked queue already creates natural gaps). Add a manual QA line: "enrolled user
interrupts while assistant is loud on open speakers." Add a note that Unit 7/8 mocked tests cannot
cover this — it is manual-only.

### A3 [P2] (confidence 7/10) — Compounded barge-in latency in `my_voice` defeats the feature for the enrolled user

The Latency Budget lists the pieces but never sums the `my_voice` chain: confirm (~300–500ms) +
candidate clip capture (enough audio to verify, ~400–600ms) + verify service (target 700ms, hard
timeout 1500ms). Realistically **1.4–2.6s** between the enrolled user starting to talk and the
assistant actually stopping. Barge-in is supposed to feel immediate; 2s+ feels broken, and it is
worst for the enrolled user (the happy path).

On-device verify (A1 / Eagle) removes the network leg and is the strongest single mitigation.
Otherwise: shorten the candidate window, verify on a rolling buffer captured *during* the confirm
window rather than after it, and expose a hard "tap to interrupt" fallback (Risk table already
mentions this — make it a first-class always-available control, not a fallback).

### A4 [P2] (confidence 9/10) — `EnvelopeAad` has no `profileId` field; bind identity precisely

`src/lib/crypto/envelope.ts` `EnvelopeAad` is a fixed shape: `table|provider|environment|tenantId|`
**`connectionId`**`|fieldName`. The plan's AAD "`...tenantId|profileId|fieldName|kid`" must reuse the
`connectionId` slot for the profile id. That is fine, but be explicit in Unit 4: pass a **distinct
`table` and `provider`** from QBO/Commerce7 (e.g. `table:"voice_profile"`, `provider:"voice_focus"`)
so a token envelope from another domain can never be opened as a voice envelope, and document that
`connectionId := profileId`. The plan's Unit 4 test list already covers transplant rejection — keep
that, and add a cross-domain transplant case (QBO envelope must not open as voice).

### A5 [P3] (confidence 8/10) — "Zeroize" is misleading on Postgres MVCC; state deletion honestly

Units 4/5 and Privacy say delete "zeroizes encrypted material." Postgres cannot zeroize in place —
an UPDATE/DELETE leaves the old tuple until VACUUM, and it survives in WAL/backups. For biometric
data the security-register entry (Unit 13) should say what is actually true: delete overwrites the
ciphertext columns and disables the profile within one tenant transaction; durable erasure depends
on VACUUM and backup retention policy. Do not claim cryptographic zeroization we do not deliver.

### T1 [P2] (confidence 7/10) — Confirm whether the assistant eval-coverage CI gate applies to Unit 10

Prior learning (assistant-coverage): the D26/H8 eval-coverage guard is a **hard CI gate** that
requires a golden case per new assistant write tool. Unit 10 classifies `set_voice_focus_mode` as a
session tool, not a persistent write, and edits `src/lib/assistant/prompt.ts`. The plan should state
explicitly whether the gate treats a session tool as covered, and whether the prompt edit trips
`assistant-coverage.md` regeneration. If the gate applies, add the golden case to Unit 10 now — a
CI-gate surprise at ship time is avoidable here.

### Failure-mode critical gaps

Two failure modes have **no test and no error handling and would present as a silent/confusing
failure**, so they are flagged critical per the review rules:
- **A2 echo contamination** → enrolled user silently cannot interrupt; no test possible (manual
  only), not in QA checklist. **Critical gap — add to Unit 12.**
- **A3 latency** → not a crash, but a silent "feels broken." Mitigated by the always-available tap
  interrupt; make that explicit so it is never a dead end.

### What already exists (reused correctly)

- VAD (`src/lib/voice/vad.ts`, pure + tested) — Unit 1 extends it; right seam.
- Mic/session state (`useMicCapture.ts`, `useVoiceSession.ts`) — `turnRef` supersession + abort is
  exactly the mechanism Unit 8 should build on; plan says so.
- STT choke point (`transcribe.ts` / `/api/assistant/transcribe`) — correct place for Unit 9
  isolation; note the existing language-pinning and non-2xx handling to mirror.
- Envelope crypto (`envelope.ts`) — reused, not rebuilt (see A4 caveat).
- `ComplianceReminderPreference` `(tenantId,userId)` precedent — verified; `VoicePreference` matches
  it exactly. Good.
- Existing tap `interrupt()` + signed-token confirm path — reused, unchanged. Good.

### Parallelization assessment

Plan's 6-lane split is sound. Confirmed conflict: Lane A and Lane E both touch `useVoiceSession.ts`
— keep E after A lands (plan flags this). Additional note: if A1 moves verification client-side,
Lane B shrinks (no verify route) and Lane E's dependency on "verification" becomes a client concern,
tightening the A→E coupling further. Resolve A1 before splitting worktrees.

**Verdict: APPROVE WITH CHANGES.** Resolve A1 (provider/seam) before building Units 4/5/7 — it is
the one decision that can cause rework. A2/A3 are the real-world "does it work on the cellar floor"
risks; design them in, not after. A4/A5/T1 are precise, low-effort corrections to the plan text.

## Council Synthesis (2026-07-08 — Codex gpt-5.4 + Gemini 3.1 Pro)

Cross-LLM adversarial review; full write-up in `council-feedback.md`. Both models were given the eng-review findings (A1–A5, T1) and asked to find what was **missed** — neither disputed the prior findings. New criticals:

- **C1 (Codex) — protected-mode gate is client-side / bypassable.** `/verify` must mint a short-lived **signed verification receipt** (`tenantId|userId|voiceSessionId|focusMode|issuedAt|provider`); `set-voice-focus.ts` verifies it server-side before any protected transition. Define this seam **before Unit 10**; it survives A1's client-vs-server verification choice.
- **C2 (Gemini) — shared-device "walk-away" lockout.** `my_voice` on a communal tablet bricks the UI for everyone but the enrolled user (who has walked away); a bystander can't even say "turn off recognition" (gated on the failing match). Add an always-visible **"Force open"** control + proactive "open to anyone?" after N unmatched bursts.
- **C3 (Gemini) — false-reject command trap.** Cold/PPE/respirator/tank-acoustics false-reject → the escape command is gated behind the failing match. If listening was tap/wake-triggered, suspend the biometric gate for mode-switch commands (or require a single physical tap).
- **C4 (Codex) — `VoiceProfile` schema incomplete for `VENDOR_REF`.** Add a nullable `providerRef`; make `status`/`provider`/`defaultFocusMode` **Prisma enums**, not freeform strings.
- **C5 (Gemini) — biometric tenant-scoping forces consulting winemakers to re-enroll per org.** Consider per-`userId` global embedding + tenant-scoped `VoicePreference`. Contradicts the Phase-12 all-tenant-scoped default → **needs an ADR**.

High-value SHOULD-FIX: unplanned assistant **event-contract** change (`assistant-events.ts` + both consumers + tests) for the confirmation card; **explicit tenant/user args** (no ALS in these helpers, per K12); pin the **enroll contract** (Unit 5 "samples" vs Unit 6 "3-sample"); **don't return `{score,threshold}`** to the browser (tuning oracle); `lastVerifiedAt` hot-row footgun; add **BIPA `consentAcceptedAt`/`consentVersion`**; **delete must cascade** `defaultFocusMode→open`; overlay must **name the constraint** ("Listening only to Dave"); distinct type/localStorage key from the existing `VoiceMode`; shared **capability object** in `config.ts`; `team_session` expiry ("overlay closes") is too aggressive.

**Council verdict: APPROVE WITH CHANGES** — consistent with eng-review. Blocking-before-`/work`: resolve the verification seam (A1) **and** the C1 receipt design together, plus C5 (biometric scope ADR). C2/C3 are the field-reliability designs; fold into Units 2/8/10/12.

## Design Review Findings (2026-07-08, autonomous)

Grounded against the live surfaces this plan touches: `VoiceOverlay.tsx` (full-screen
`aria-modal` dialog with focus trap, Esc-to-close, `aria-live` state line, caption stream,
`ProposalCard` confirm), `SettingsClient.tsx` (Card sections, `Eyebrow`, `Badge`, a
`role="switch"` toggle with 44px min target, inline save messages), and `DESIGN.md`
(warm paper, one wine accent, sentence-case, light-only, 44px touch targets, 768px shell
breakpoint). The plan's own "Design Notes" section is a good skeleton — status badge,
primary action, mode selector, toggle, destructive delete, one privacy line, compact overlay
indicator. It reuses the right components and stays anti-slop. The gaps below are the states,
copy, and recovery flows that will otherwise get invented at implementation time.

This was a text-only review (design mockup binary not installed). Autonomous run — no
interactive questions asked; genuine choices are recorded under "Deferred design decisions"
rather than defaulted silently.

**Score: 5/10 → 8/10 after the specs below are folded into Units 2, 6, 8, 10, 13.**

### Pass ratings

| Pass | Dimension | Before | After | Why |
|------|-----------|--------|-------|-----|
| 1 | Information architecture | 6 | 8 | Settings section anatomy exists; enrollment-flow ordering + overlay indicator placement now specified |
| 2 | Interaction state coverage | 3 | 8 | No state table existed; added one for enrollment + verify + mode surfaces |
| 3 | User journey / emotional arc | 4 | 8 | Council C2/C3 (walk-away lockout, false-reject trap) were named but not designed — now concrete UI |
| 4 | AI slop risk | 8 | 9 | App UI reusing tokens/components; only gap was unpinned copy strings |
| 5 | Design-system alignment | 8 | 9 | Strong; one correction — "Active" badge tone (`gold` renders wine per known drift) |
| 6 | Responsive & accessibility | 5 | 8 | Overlay a11y inherited/strong; enrollment recording a11y, mode-change announce, mobile layout, touch targets now specified |
| 7 | Unresolved decisions | — | — | 4 deferred (below) |

### DR1 [Pass 3, HIGH] — Shared-device recovery is the biggest design gap; council C2/C3 were named, never designed

On a communal cellar/crush-pad tablet, `my_voice` mode is a lockout waiting to happen. The
enrolled user enables it, walks away, and now no one can talk to the assistant — and the
escape command ("turn off speaker recognition") is itself gated behind the match that keeps
failing. Cold voice, a respirator/PPE mask, tank acoustics, or a hoarse morning all reproduce
the same trap for the *enrolled* user. This is the "device feels broken" moment, and it is
currently undesigned.

**Fold into Units 2 + 8 + 10 (overlay + gated barge-in + tool). Add to the plan:**
- The overlay always renders a **physical "Open to anyone" control** (tap/keyboard), never
  gated on a voice match. Physical taps in the overlay (`Interrupt`, `End`, and this new
  control) always bypass the biometric gate — state this as an invariant.
- After **N consecutive unmatched sustained-speech bursts** (recommend N=2) in `my_voice`,
  the overlay proactively surfaces a card: *"Still can't tell it's you. Open this session to
  anyone?"* with a single tap to drop to `team_session`. This is the C2/C3 escape that does
  not require a passing match.
- `End` (close overlay) already exists as a hard exit — keep it, but recovery must not force
  the user to close and relaunch; the in-overlay "Open to anyone" is the graceful path.
- Manual QA line (Unit 12): "enrolled user walks away in `my_voice` — a second person can
  recover the session without the enrolled user present."

### DR2 [Pass 2, HIGH] — No interaction-state table; enrollment + verify + env-unconfigured states are unspecified

The plan never enumerates what the user *sees* per state. Add this table to the plan and
build to it (Units 6, 7, 8):

| Surface | Loading | Empty / not-set-up | Error | Success | Partial |
|---------|---------|--------------------|-------|---------|---------|
| Settings › Voice (env not configured) | — | Section renders **disabled** with one line: "Voice recognition isn't available on this winery yet." (do **not** hide it silently — a hidden section gives no signal to an admin who expects it) | — | — | — |
| Enrollment — mic permission | "Waiting for mic…" | If denied: "Cellarhand needs mic access to set up voice recognition. Enable it in your browser and try again." + retry | Generic capture failure → retry, never a dead end | — | — |
| Enrollment — 3-sample capture | Per-sample live mic-level meter + "Recording 1 of 3…" | Prompt state: "Read this line aloud: '…'" | Low-quality sample → "That was hard to hear — try again somewhere quieter" (re-record that sample, don't restart) | Badge flips **Not enrolled → Active**; show quality as words ("Good"/"Fair"), never a raw score | 1–2 of 3 done → progress dots; leaving mid-flow discards, with a confirm |
| `NEEDS_REENROLL` status | — | Badge reads "Needs re-enrollment" with a "Re-enroll" primary action | — | — | — |
| Speaker verify (in `my_voice`) | Only show a "Checking…" hint if it exceeds ~600ms — do not flash it every burst | — | Provider down/timeout → assistant keeps speaking; overlay may say "Couldn't verify — still listening" (no raw reason/score) | Match → playback stops, listen | — |
| Delete profile | "Removing…" | — | Failure → "Couldn't remove your voice profile. Try again." | Toast + badge → Not enrolled; `defaultFocusMode` resets to Open | — |

### DR3 [Pass 3+4, HIGH] — Voice-mode overlay indicator must name the constraint; pin the mode display names

Council said "name the constraint" and it belongs in the Design Notes. A cellar worker three
feet from a tablet with wet hands must know at a glance who the assistant is listening to.

**Fold into Unit 2. Add to the plan:**
- Compact, glanceable focus indicator in the overlay, always visible, using existing `Badge`
  tones (not new chrome): **"Open to anyone"** (neutral), **"Listening only to you"** /
  **"Listening only to {firstName}"** (wine accent), **"Team session"** (neutral, with a
  "for now" nuance). Use the signed-in first name from the session — never a stored PII string.
- On any mode change, announce it via `aria-live="polite"` (see DR5) and show a brief visual
  confirmation, reusing the `ProposalCard`/state-line pattern rather than a new toast system.
- **Pin the UI copy strings now** (the plan mixes "Voice Focus", "speaker recognition",
  "Recognize my voice", `my_voice`). Recommended user-facing set, sentence-case per DESIGN.md:
  section = **"Voice recognition"**; modes = **"Open"** / **"My voice"** / **"Team session"**;
  toggle = **"Recognize my voice in this session"**. Keep `open|my_voice|team_session` as
  internal identifiers only.

### DR4 [Pass 4, MED] — Enrollment consent + deletion copy are undesigned (trust + BIPA)

You are capturing biometric voice data. The single privacy line in Design Notes covers the
overlay, not enrollment. Council flagged BIPA `consentAcceptedAt`/`consentVersion`; that consent
needs a *screen*, not just a column.

**Fold into Units 6 + 13. Add these pinned copy strings to the plan:**
- **Before the first sample** (consent gate, must be acknowledged): *"We'll create a
  mathematical voiceprint so Cellarhand can tell when it's you talking. We don't keep your
  recorded audio. This isn't a password — sign-in and change confirmations still protect your
  work. You can delete your voiceprint any time."*
- **Delete confirm** (destructive, reuse `ConfirmButton`): *"Delete your voiceprint? This turns
  off 'My voice' everywhere and can't be undone."*
- Never surface embeddings, ciphertext, provider bodies, or match scores in any copy (matches
  the security requirements already in the plan).

### DR5 [Pass 6, MED] — Accessibility: new surfaces must match the overlay's existing rigor

The overlay already does focus trap + `aria-modal` + `aria-live` state — new elements must not
regress that. **Fold into Units 2 + 6:**
- Enrollment is inherently audio. Every spoken prompt must also be **on-screen text**, and
  recording start/stop/progress must be announced via `aria-live` (a deaf user enrolls by
  reading; recording state can't be sound-only).
- Mode changes announced via `aria-live="polite"` ("Now listening only to you" / "Open to
  anyone") so screen-reader users aren't silently locked out — this is the a11y face of DR1.
- Voice mode must stay **fully operable without speaking**: the "Open to anyone" recovery
  control, mode selector, and delete confirm are reachable inside the existing focus trap and
  keyboard-operable. Reuse the `role="switch"` toggle pattern from `SettingsClient.tsx` (44px
  min) for the audio-isolation and mode controls.
- Don't rely on accent color alone to distinguish modes (light-only palette, one wine accent) —
  pair color with the text label already required in DR3.

### DR6 [Pass 6, MED] — Mobile / cellar-floor ergonomics for enrollment and recovery controls

The overlay is `position:fixed; inset:0` — already full-screen and fine on mobile. Two gaps:
- **Enrollment on 375px:** the 3-sample recording flow with a live mic-level meter is a layout
  the plan hands off as "reuse Settings patterns," but existing Settings cards are form-dense and
  cap at 560px. Specify a single-column, one-sample-at-a-time mobile flow with a large record
  button (≥44px, recommend larger for gloved/wet hands) and progress dots — not a cramped form.
- **Touch targets for critical controls:** the overlay's current close "✕" is `fontSize:22` with
  no explicit hit box. The new DR1 "Open to anyone" recovery control is safety-critical on a
  shared tablet — spec it as a real `Button` (≥44px), not an icon glyph. Bump the ✕ hit area to
  44px while here.

### DR7 [Pass 5, LOW] — "Active" status badge tone (known DESIGN.md drift)

DESIGN.md known-drift #1: `Badge tone="gold"` renders wine burgundy, not gold. For the voice
status badge, use semantic tones deliberately: **Active = `tone="green"`** (positive), **Needs
re-enrollment = `tone="gold"`** (warning — accepting it reads as wine until the drift is fixed,
which is acceptable here), **Not enrolled = `tone="neutral"`**. Don't reach for a new color.

### Deferred design decisions (genuine choices, not defaulted)

These need an owner call; recorded so they aren't silently decided in code:
1. **`team_session` expiry.** Plan says it expires "when the overlay closes"; council called that
   too aggressive for a shared tablet that's rarely closed. Options: expire on overlay close
   (current), expire after an idle timeout, or expire only on explicit "back to my voice." Ties to
   DR1 — recommend idle-timeout + explicit revert, not close-only.
2. **Verify-in-progress visibility.** Show a "Checking…" state during `my_voice` verification, or
   keep it invisible unless slow (DR2 assumes the latter, ~600ms threshold)? Affects perceived
   latency (eng A3).
3. **Env-not-configured Settings section:** disabled-with-explanation (DR2 recommendation) vs
   hidden entirely (matches the existing hidden "Talk" button pattern). Recommend disabled — an
   admin needs the signal.
4. **Mode-change confirmation surface:** reuse `ProposalCard`/state-line (DR3 recommendation) vs a
   new toast/event on `assistant-events.ts` (council flagged this as an unplanned contract change).
   Recommend reuse to avoid the extra contract.

### What already exists (reuse, don't rebuild)

- `VoiceOverlay.tsx` — full-screen `aria-modal`, focus trap, Esc, `aria-live` state line,
  `ProposalCard` confirm, `Interrupt`/`End` controls. DR1/DR3/DR5 extend this, don't replace it.
- `SettingsClient.tsx` — Card + `Eyebrow` + `Badge` section rhythm, `role="switch"` 44px toggle,
  inline save messages, `ConfirmButton` for destructive actions. The Voice section slots in here.
- `DESIGN.md` tokens — warm paper, one wine accent, sentence-case, light-only, semantic status
  colors, 44px targets, 768px shell breakpoint. All copy/tone specs above conform.

### NOT in scope (design)

- No new component primitives — everything above reuses `Button`/`Card`/`Badge`/`Input`/
  `ConfirmButton`/`role="switch"`.
- No dark mode (light-only by DESIGN.md decision).
- No wake-word UI (plan-deferred; only a disabled capability note).
- No live visual QA — deferred to `/design-review` after the UI renders (already in the Review Log).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 6 issues (2×P1, 3×P2, 2×P3 incl. T1), 2 critical failure-mode gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES_OPEN | score 5→8; 7 findings (3 HIGH: shared-device recovery, state table, overlay constraint/naming), 4 deferred decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 6 eng-review findings (A1–A5, T1) + 4 deferred design decisions (team_session expiry, verify visibility, env-unconfigured section, mode-change surface). Autonomous run — no interactive decisions taken.
- **CROSS-MODEL:** Design review reinforces council C2/C3 (shared-device lockout, false-reject trap) — DR1 turns them into concrete overlay UI. Council's "name the constraint" and BIPA-consent notes are now designed (DR3, DR4).
- **VERDICT:** ENG + DESIGN — APPROVE WITH CHANGES. Eng: resolve A1 (verification seam) before Units 4/5/7. Design: fold DR1–DR7 into Units 2/6/8/10/13 (DR1 shared-device recovery is the highest-value UX gap). Not yet CLEARED for ship — findings open; run `/design-review` after UI renders.
