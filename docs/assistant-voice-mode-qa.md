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
