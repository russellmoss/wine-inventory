---
title: openWakeWord ONNX foreground wake phrase
date: 2026-07-08
status: planned
owner: Cellarhand
---

# openWakeWord ONNX Foreground Wake Phrase Plan

## Decision

Disable the browser-speech/Picovoice prototype now and replace it with a local
openWakeWord ONNX implementation in a separate feature pass.

The prototype proved the product shape, but it was not good enough for cellar
noise: browser speech recognition is too inconsistent for a wake phrase, and
Picovoice adds vendor/account friction before we have enough confidence that the
feature is worth that tradeoff.

## Goal

When Cellarhand is open in the browser tab or installed PWA window, an opted-in
user can say "Hey Cellarhand" and the app opens Talk without clicking the Talk
button.

The first version is foreground-only. It does not promise Siri-style behavior
when the browser/app is fully closed, the device is locked, or the OS has
suspended the page.

## Non-Goals

- No closed-app/background hotword behavior in this plan.
- No native iOS/Android wrapper work in this plan.
- No cloud wake-word detection.
- No raw wake audio storage.
- No wake phrase for unauthenticated users.
- No wake phrase unless the user explicitly enables it.

## Architecture

Add a client-only wake engine behind the existing inert capability boundary:

- `src/lib/voice/wake-word.ts` remains the pure capability and transcript helper
  layer.
- A new client hook owns mic access, audio resampling, ONNX inference, score
  smoothing, visibility pause/resume, and cleanup.
- A global assistant controller opens Talk from a trusted wake event when the app
  is visible and the authenticated user's setting is enabled.
- Settings only enables the toggle when the model asset is present and the
  browser supports the required audio APIs.

Expected runtime:

- `onnxruntime-web` for browser ONNX inference.
- openWakeWord-compatible ONNX model exported for "Hey Cellarhand".
- Web Audio `AudioWorklet` or `ScriptProcessorNode` fallback for microphone PCM.
- Local score threshold and debounce rules tuned from real cellar recordings.

## Model Asset

Create or obtain a custom "Hey Cellarhand" openWakeWord ONNX model before coding
the production toggle.

Candidate asset path:

```text
public/vendor/openwakeword/hey-cellarhand.onnx
```

Candidate future env/config:

```text
NEXT_PUBLIC_WAKE_WORD_PROVIDER=openwakeword
NEXT_PUBLIC_OPENWAKEWORD_MODEL_PATH=/vendor/openwakeword/hey-cellarhand.onnx
NEXT_PUBLIC_OPENWAKEWORD_THRESHOLD=0.5
```

Do not turn the setting on if the model is missing. The UI should say that wake
phrase setup is unavailable rather than silently falling back to speech
recognition.

## Implementation Units

### Unit 1: Model Spike

- Export a "Hey Cellarhand" ONNX model.
- Verify the model can run with `onnxruntime-web` in Chrome and Edge.
- Capture a tiny local test harness that feeds sample WAV clips and prints
  wake scores.
- Decide initial threshold, debounce window, and cooldown.

Acceptance:

- Positive samples wake reliably from the harness.
- Negative samples such as music, desk taps, and nearby speech do not wake.
- Model file size and inference latency are acceptable for app load.

### Unit 2: Browser Wake Engine

- Add `onnxruntime-web`.
- Add a client-only wake hook, likely under
  `src/app/(app)/assistant/voice/useOpenWakeWord.ts`.
- Request mic access only when the user enables the setting.
- Run inference locally; never send wake audio to the server.
- Pause when the page is hidden, Talk is open, the user is logged out, or the
  setting is off.
- Clean up media tracks and audio nodes on unmount.

Acceptance:

- No wake mic stream starts by default.
- Enabling the setting starts one foreground mic stream.
- Disabling the setting immediately stops tracks.
- Talk opens once per wake phrase, then the wake listener pauses until Talk
  closes.

### Unit 3: App-Level Talk Launch

- Move wake listening to the app surface that exists whenever Cellarhand is open,
  not only inside the assistant page.
- Reuse the same Talk overlay and assistant history as manual Talk.
- Add a short greeting that uses the active user's first name only after the wake
  is accepted.
- Keep write confirmations unchanged.

Acceptance:

- Wake works from `/assistant` and normal authenticated app pages.
- Wake does not run on public/auth pages.
- Manual Talk still works when wake phrase is disabled.

### Unit 4: Settings and Persistence

- Re-enable the **Wake phrase while Cellarhand is open** toggle only when the
  local provider is available.
- Persist `wakeWordEnabled` through the existing voice preference model.
- Show concise unavailable copy when the browser lacks required APIs or the model
  asset is not configured.

Acceptance:

- Hydration stays stable: server-rendered settings do not depend on browser-only
  capability checks.
- The toggle cannot enable a missing provider.
- Saving preferences still works for `open`, `my_voice`, and `team_session`.

### Unit 5: Verification and Tuning

Run the normal automated suite plus wake-specific manual QA.

Automated:

```text
npm run lint
npx tsc --noEmit
npm test -- --run test/voice-wake-word.test.ts test/voice-vad.test.ts test/voice-focus.test.ts test/voice-voiceprint.test.ts
npm run build
```

Manual:

- Quiet office: 20 positive "Hey Cellarhand" attempts.
- Music/HVAC: 10 minutes idle false-wake test.
- Desk taps/glass set-downs: no wake.
- Other speaker nearby: no wake unless they say the phrase clearly.
- Talk already open: wake listener pauses.
- Hidden tab: wake listener pauses.
- Disable setting: mic indicator turns off.
- Battery/CPU pass on laptop.

## Privacy and Safety

- Wake detection runs locally in the browser.
- No wake audio is stored.
- No wake audio is sent to ElevenLabs or the assistant API.
- The setting is explicit opt-in.
- The app shows a clear mic-use state while foreground wake is enabled.
- Wake opens conversation only; protected write actions still require the
  existing confirmation flow.

## Rollback

If false wakes or CPU usage are not acceptable, force
`wakeWordCapability().enabled` to `false`, keep preferences persisted but inert,
and ship the voice-focus improvements without wake phrase.

## Open Questions

- Best model-generation path for "Hey Cellarhand": hosted openWakeWord tooling,
  local training, or a small curated dataset.
- Whether the wake engine should live in the root authenticated layout or a
  dedicated assistant provider.
- Whether we need a PWA install prompt before promoting wake phrase beyond
  `/assistant`.
- How much wake status UI is useful without making the app feel like it is
  constantly listening.
