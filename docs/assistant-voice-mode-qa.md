# Assistant Voice Mode — Manual QA Checklist

Browser audio (mic capture, Web Audio playback, the visualizer) can't be unit
tested, so verify these by hand. Pure logic (VAD, sentence chunking, speech
normalization, audio queue, config, transcribe) is covered by `test/voice-*.test.ts`.

## Setup

1. Copy `ELEVENLABS_API_KEY` from the `horseplay` project's `.env` into this
   project's `.env`. Ensure `OPENAI_API_KEY` is also set (powers transcription).
2. Run `npm run dev` and open `/assistant` over `http://localhost:3000` (mic needs
   a secure context; localhost counts).
3. Sign in. A "🎙 Talk" button appears next to Send. (If the keys are missing the
   button is hidden — that's the graceful-degradation path.)

## Happy path

- [ ] Click **Talk** → browser asks for mic permission → grant it.
- [ ] Overlay opens; the orb appears and shows **Listening…**.
- [ ] Say: *"What's the latest Brix for Block 3?"* Captions show your words; state
      moves Listening → Got it → Thinking → **Speaking…**.
- [ ] The assistant answers out loud within ~1–1.5s of starting; the orb pulses to
      the voice. After it finishes, it returns to **Listening…** automatically.
- [ ] Ask a follow-up without clicking anything — the loop continues hands-free.

## Write confirmation (safety)

- [ ] Say: *"Log 22.4 Brix for Block 3."* The assistant speaks a confirmation and a
      **Confirm change** card appears. It does NOT commit on its own.
- [ ] Tap **Confirm** → the change applies and the card shows ✓.
- [ ] Repeat, but instead of tapping say *"confirm"* → it applies. Say *"cancel"* on
      a fresh proposal → it cancels. (Voice confirm only acts on the pending card.)

## Barge-in / interrupt

- [ ] While the assistant is speaking, click **Interrupt** → playback stops, it
      listens again.
- [ ] While speaking, start talking over it → playback stops and it listens
      (best-effort acoustic barge-in; relies on echo cancellation).

## Continuity + persistence

- [ ] Close the overlay (**End** or **Esc**). The spoken turns are present in the
      text transcript below.
- [ ] The conversation appears/updates in the sidebar (same `/api/assistant`
      persistence the text chat uses).
- [ ] Type a text follow-up referencing the voice turn — context carries over.

## Failure / degradation

- [ ] Deny mic permission → overlay shows a clear message + "Switch to text"; text
      chat still works.
- [ ] Temporarily unset `ELEVENLABS_API_KEY`, restart dev → the Talk button is gone;
      no errors.
- [ ] Network blip mid-reply → it surfaces an error and recovers to listening rather
      than hanging.

## Design / accessibility

- [ ] Orb colors match the accent token (`/styleguide`); nothing hardcoded.
- [ ] With OS "reduce motion" on, the orb pulses gently instead of reacting sharply.
- [ ] Run `/design-review` on the overlay against `DESIGN.md`.

## Browsers

- [ ] Chrome (primary), Edge, Safari. Note any Web Audio autoplay quirks (the
      AudioContext is created on the Talk click to satisfy autoplay policy).

## Voice Focus / speaker recognition

- [ ] While the assistant is speaking, put a glass, book, or small tool down on
      the desk. Playback should continue; a short clink/tap should not trigger
      barge-in.
- [ ] Open **Settings -> Voice recognition**. If encryption/voice config is
      unavailable, the section is visible but disabled with a clear explanation.
- [ ] Enroll a voiceprint: accept the consent copy, click **Start recording**,
      read each prompt at a natural pace, click **Stop recording**, repeat for
      all three samples, and confirm the badge changes from **Not enrolled** to
      **Active**.
- [ ] In Settings, set **Default voice mode** to **My voice** and keep noisy-audio
      cleanup off for the first pass.
- [ ] Open **Talk**. The overlay shows **Listening only to you** or falls back to
      **Open to anyone** if no active profile is available.
- [ ] While the assistant is listening in **My voice**, have the enrolled user ask
      a normal question. It should transcribe and answer.
- [ ] While the assistant is speaking in **My voice**, make a desk tap or play a
      short music transient. Playback should continue.
- [ ] While the assistant is speaking in **My voice**, have someone else speak.
      Playback should continue unless the candidate matches the enrolled profile.
- [ ] Say **turn off speaker recognition** as the enrolled user. The current
      session switches to **Team session** / **Open to anyone for this session**.
- [ ] Tap **Open to anyone**. This must work even if speaker verification is
      rejecting voices.
- [ ] In **My voice**, produce two unmatched sustained-speech attempts. The overlay
      should surface recovery copy offering to open the session to anyone.
- [ ] Delete the voiceprint in Settings. The badge returns to **Not enrolled** and
      the default mode resets to **Open**.

## Audio isolation

- [ ] Enable **Clean noisy audio before transcription when possible** in Settings.
- [ ] With music or HVAC noise in the room, ask a question. If the isolation
      provider fails or times out, the app should fall back to the original audio
      instead of hanging.

## Foreground wake phrase

- [ ] In Settings, confirm **Wake phrase while Cellarhand is open** is disabled.
- [ ] Open `/assistant` and leave it idle. There should be no wake-phrase status
      line such as "armed", and the browser should not start a wake-listening mic
      stream outside the Talk overlay.
- [ ] Say **Hey Cellarhand** while the assistant page is open. Nothing should open
      until the openWakeWord ONNX implementation ships.
- [ ] Click **Talk** manually. The normal voice conversation flow should still work.
- [ ] Keep this section disabled until
      `docs/plans/2026-07-08-048-feat-openwakeword-onnx-wake-phrase-plan.md`
      is implemented and verified.
