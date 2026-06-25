---
title: Jarvis-style Voice Mode for the Assistant
type: feat
status: completed
date: 2026-06-25
branch: feat/assistant-voice-mode
depth: deep
units: 12
---

## Overview

Add a hands-free "voice mode" to the existing assistant chat. The user opens a full-screen
talking overlay, speaks naturally, and the assistant transcribes the speech, runs it through
the existing Claude Opus tool-use loop, and speaks the reply back via ElevenLabs TTS — with a
glowing, audio-reactive visualizer that pulses to whoever is talking. The feel target is the
claude.ai voice mode: low-latency, alive, conversational.

This rides on top of the assistant pipeline that already exists (`src/lib/assistant/run.ts`
streams text deltas over NDJSON; `AssistantChat.tsx` already consumes that stream). Voice mode
reuses that stream end-to-end — it adds ears (mic capture + server transcription), a mouth
(sentence-streamed TTS), and a face (the visualizer). It does not fork the assistant logic.

## Problem Frame

The assistant today is text-only: type a message, read a reply. That's fine at a desk but
useless with hands full in a cellar or vineyard — exactly where someone wants to say "log 24
Brix on Block A" or "what's the yield estimate for Riesling" without typing. Voice mode makes
the assistant usable in the field and gives it the presence the user is asking for ("feel like
Jarvis"). Doing nothing leaves a capable assistant trapped behind a keyboard.

Product note: the assistant has a deliberate write-confirmation safety model (signed proposal
token, single-use nonce, tap to confirm — see `src/lib/assistant/confirm.ts`, `commit.ts`).
Voice mode must NOT weaken that. Writes still require explicit confirmation; voice just makes
the proposal audible. This is the one place where "magical and hands-free" must yield to "don't
silently mutate the inventory."

## Requirements

- MUST: Hands-free loop — open voice mode → it listens → user speaks → auto-detect end of
  speech → transcribe → assistant thinks → speaks reply → returns to listening.
- MUST: Speech-to-text via a server route (accurate, cross-browser) using the existing
  `OPENAI_API_KEY` (Whisper / `gpt-4o-transcribe`).
- MUST: Text-to-speech via ElevenLabs, reusing the `ELEVENLABS_API_KEY` pattern from the
  `horseplay` project. Sentence-streamed: speak each sentence as the assistant generates it.
- MUST: Audio-reactive visualizer shown during talking mode — pulses to mic input while
  listening and to TTS playback while speaking. Built with design tokens.
- MUST: Reuse the existing `/api/assistant` stream and tool-use loop; share conversation
  history with the text chat. No second assistant brain.
- MUST: Preserve the write-confirmation security model. Proposals are spoken + shown; commit
  requires an explicit confirm action (tap, and optionally a matched spoken "confirm").
- MUST: Graceful degradation — if the browser denies the mic or audio playback fails, fall
  back to text chat with a clear message. Secrets never reach the client.
- SHOULD: Barge-in — if the user starts talking while the assistant is speaking, stop playback
  and listen.
- SHOULD: Live captions of both sides in the overlay (accessibility + confidence the STT heard
  correctly).
- SHOULD: Configurable voice id / model / TTS tuning via env, with sane defaults.
- NICE: A "wake on open" greeting, mute toggle, and a visible transcript that persists back
  into the text chat history when voice mode closes.
- NICE: Voice "confirm"/"cancel" to action a pending write proposal (still gated by the signed
  token + nonce server-side).

## Scope Boundaries

**In scope:**
- New TTS route, new STT route, new env vars.
- New client modules: mic capture + voice-activity detection (VAD), TTS playback queue,
  sentence chunker, voice session state machine, the visualizer, the overlay UI.
- Wiring a "talk" entry point into `AssistantChat.tsx` and sharing history.
- Markdown/speech normalization so the TTS reads clean prose, not asterisks and backticks.

**Out of scope:**
- Wake-word / always-on background listening ("Hey Jarvis" with the app backgrounded). Voice
  mode is an explicit, foregrounded session the user opens.
- Changing the assistant's model, tools, or prompt behavior beyond what voice needs.
- Real-time bidirectional websockets / WebRTC. We use request/response over the existing NDJSON
  stream plus short audio POSTs — adequate for sentence-streamed latency, far less complexity.
- Multi-language. Default English; voice/model are env-configurable but we don't build a
  language picker.
- Persisting audio clips. TTS audio is ephemeral (played, not stored).

## Research Summary

### Codebase Patterns
- `src/app/(app)/assistant/AssistantChat.tsx` (client, lines 1–276): POSTs `{ messages }` to
  `/api/assistant`, reads `res.body.getReader()`, decodes newline-delimited JSON events
  (`text` | `tool` | `proposal` | `error` | `done`), appends `text` deltas to the last
  assistant message, shows `status` for tool phases, renders proposal confirmation cards. This
  is the stream voice mode consumes.
- `src/app/api/assistant/route.ts` (Node runtime, 60s max): validates auth + message shape,
  wraps `runAssistant({ user, messages, send })` in a `ReadableStream`, encodes each event as
  `JSON.stringify(e) + "\n"` with `application/x-ndjson`.
- `src/lib/assistant/run.ts`: Claude Opus 4.8 manual tool-use loop via `@anthropic-ai/sdk`
  `client.messages.stream()`; emits `text` deltas, `tool` start/end, `proposal` cards.
- Write safety: `src/lib/assistant/confirm.ts` (HMAC-signed proposal token, 5-min TTL),
  `commit.ts` (single-use nonce burned via DB constraint), tools return
  `{ needsConfirmation, preview, token }` and never mutate on first call.
- Env access: server reads `process.env.X` directly (e.g. `ANTHROPIC_API_KEY` in run.ts,
  `BETTER_AUTH_SECRET` in confirm.ts). `.env.example` enumerates keys. `OPENAI_API_KEY` is
  already listed/available.
- Markdown rendering exists (`Markdown.tsx`, commit 78ef989) — parses `**bold**`, `` `code` ``,
  lists, headings with inline styles + design tokens. Voice needs the inverse: strip that
  syntax before TTS.
- Styling: Tailwind v4 + CSS-variable design tokens (`--accent`, `--surface-raised`,
  `--text-primary`, `--space-*`, `--font-heading`) in `src/styles/tokens/`. AssistantChat uses
  inline `CSSProperties`. No external CSS for the component.
- No existing Web Audio, canvas, framer-motion, or visualizer code anywhere — green field.
- Deps present: `@anthropic-ai/sdk` ^0.105, `next` 16.2.9, `react` 19.2.4. No ElevenLabs SDK,
  no animation lib. We will use raw `fetch` + native Web Audio + canvas (no new runtime deps).

### External Research (ElevenLabs, from the `horseplay` project)
- Key env var: `ELEVENLABS_API_KEY` (raw `fetch`, no SDK needed). Header `xi-api-key`.
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` with
  `accept: audio/mpeg`, body `{ text, model_id, voice_settings: { stability, similarity_boost } }`.
- A streaming variant exists: `.../text-to-speech/{voiceId}/stream` — returns chunked
  `audio/mpeg`, which we proxy straight through for lower time-to-first-audio.
- Reference values from horseplay: voice `Cb8NLd0sUB8jI4MW2f9M`, model `eleven_turbo_v2`,
  `stability 0.5`, `similarity_boost 0.75`. We default to these but make them env-overridable
  (recommend `eleven_turbo_v2_5` or `eleven_flash_v2_5` for lower latency).
- horseplay did STT with the browser `SpeechRecognition` API — we are intentionally NOT copying
  that (the user chose server-side accuracy for wine jargon). We borrow only the TTS pattern.

### Prior Learnings
- No relevant prior voice/audio learnings found in the project store. (First audio feature.)

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Interaction model | Hands-free continuous loop with VAD end-of-speech | Push-to-talk; toggle of both | User chose hands-free — most Jarvis-like. VAD silence detection drives the turn boundary. |
| Speech-to-text | Server route → OpenAI transcription (`OPENAI_API_KEY`) | Browser `SpeechRecognition`; ElevenLabs Scribe | User chose accuracy/cross-browser. Key already present; Whisper handles varietal/block jargon far better than browser STT. |
| TTS responsiveness | Sentence-streamed: chunk the assistant stream by sentence, synth each, queue + play | Synthesize the whole reply once | User chose streaming. Time-to-first-audio ~1s vs several seconds; feels alive. |
| TTS transport | Proxy ElevenLabs `/stream` endpoint per sentence through our route | Return full clip per sentence | Lower latency to first audio per sentence; route still hides the key. |
| New deps | None — raw `fetch`, native Web Audio API, `<canvas>` + `requestAnimationFrame` | `wavesurfer.js`, `framer-motion`, `elevenlabs` SDK | Matches the codebase's zero-extra-dep instinct; full control over the visualizer look. |
| Mic capture | `MediaRecorder` (webm/opus) for the audio blob + a parallel `AnalyserNode` for VAD/levels | Raw `ScriptProcessor` PCM | MediaRecorder is the modern, simplest path to a server-uploadable blob; AnalyserNode gives RMS for silence detection and the visualizer. |
| Write safety in voice | Speak the proposal aloud + show the existing confirm card; commit needs explicit tap (voice "confirm" is a NICE enhancement that still hits the signed-token/nonce path) | Auto-commit on voice; trust spoken "yes" alone | Never silently mutate inventory. Preserves `confirm.ts`/`commit.ts` guarantees. |
| Session orchestration | One `useVoiceSession` hook owning an explicit state machine (`idle→listening→transcribing→thinking→speaking→listening`) + barge-in | Ad-hoc state spread across components | A single state machine keeps audio contexts, queues, and turn-taking coherent and testable. |

## Implementation Units

### Unit 1: Voice config + ElevenLabs server lib + env

**Goal:** One place that reads voice secrets/config and synthesizes speech server-side.
**Files:** `src/lib/voice/config.ts` (new), `src/lib/voice/elevenlabs.ts` (new),
`.env.example` (modify).
**Approach:** `config.ts` reads `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
(default `Cb8NLd0sUB8jI4MW2f9M`), `ELEVENLABS_MODEL_ID` (default `eleven_turbo_v2_5`),
plus optional stability/similarity (defaults 0.5 / 0.75), and exposes a `voiceEnabled` boolean.
`elevenlabs.ts` exports `synthesizeStream(text): Promise<ReadableStream>` doing a raw `fetch` to
the `/text-to-speech/{voiceId}/stream` endpoint with `xi-api-key`, returning the upstream body
to proxy. Mirror the horseplay request shape. Add the new keys (no values) to `.env.example`
with comments noting they reuse the horseplay key.
**Tests:** Unit test config defaults/overrides and the `voiceEnabled` gate. Mock `fetch` to
assert request headers/body/URL in `synthesizeStream`.
**Depends on:** none
**Patterns to follow:** env access like `src/lib/assistant/run.ts:51`; horseplay
`lib/ai/elevenlabs.ts` request shape.
**Verification:** `npm run build` clean; unit tests pass; with the key set, a manual curl-style
call returns `audio/mpeg`.

### Unit 2: Speech text normalization

**Goal:** Turn assistant markdown into clean spoken prose.
**Files:** `src/lib/voice/speech.ts` (new).
**Approach:** `toSpeakable(markdown): string` strips `**`, backticks, list bullets/`#` headings,
collapses links to their text, normalizes units the assistant emits for the cellar context
(e.g. "24.5 °Bx" → "24.5 Brix", "Block A" left intact). Pure function, no deps. Mirror the
spirit of horseplay's `lib/ai/speech.ts` but for wine vocabulary, not racing.
**Tests:** Table-driven: markdown samples → expected spoken strings (bold, code, lists, the
`°Bx` case, links, multiple sentences preserved).
**Depends on:** none
**Verification:** Unit tests pass.

### Unit 3: Sentence chunker

**Goal:** Split a growing token stream into complete sentences to hand to TTS, without cutting
mid-sentence.
**Files:** `src/lib/voice/sentence-chunker.ts` (new).
**Approach:** A small stateful `SentenceChunker` with `push(textDelta): string[]` (returns any
newly completed sentences) and `flush(): string | null` (remaining tail at stream end). Detect
boundaries on `.!?` followed by space/EOL/quote, guard common abbreviations and decimals
(e.g. "24.5" is not a boundary). Pure logic, runs client-side as deltas arrive.
**Tests:** Feed deltas split at awkward points (mid-word, mid-number, mid-abbreviation) and
assert sentence emission matches expected; assert `flush()` returns the tail.
**Depends on:** none
**Verification:** Unit tests pass.

### Unit 4: TTS proxy route

**Goal:** A server endpoint the client calls per sentence to get streamed audio, keeping the key
server-side.
**Files:** `src/app/api/assistant/speak/route.ts` (new).
**Approach:** `POST { text }`, Node runtime. Auth-check the user the same way
`src/app/api/assistant/route.ts` does (signed in, not banned). Run `text` through
`toSpeakable` defensively, call `synthesizeStream`, return the audio `ReadableStream` with
`Content-Type: audio/mpeg`. Validate text length (cap, e.g. 1500 chars/sentence). If
`!voiceEnabled`, return 503 with a clear JSON error.
**Tests:** Route-level: unauthenticated → 401; empty/oversized text → 400; happy path returns
`audio/mpeg` (mock `synthesizeStream`).
**Depends on:** Unit 1
**Patterns to follow:** auth + stream shape in `src/app/api/assistant/route.ts:29-59`.
**Verification:** From the running app, POST a sentence and hear/inspect returned MP3 bytes.

### Unit 5: STT transcribe route

**Goal:** Accept recorded audio and return an accurate transcript.
**Files:** `src/app/api/assistant/transcribe/route.ts` (new), `src/lib/voice/transcribe.ts`
(new).
**Approach:** `POST multipart/form-data` with an audio blob (webm/opus). Auth-check as above.
`transcribe.ts` posts the audio to the OpenAI transcription endpoint
(`gpt-4o-transcribe`, fallback `whisper-1`) with `OPENAI_API_KEY` via raw `fetch` (FormData),
optionally passing a domain prompt/hotwords (varietals, "Brix", block labels) to bias accuracy.
Return `{ text }`. Cap upload size (e.g. 20 MB) and duration.
**Tests:** Route-level: unauthenticated → 401; missing file → 400; happy path returns `{ text }`
(mock the OpenAI call). Unit test the FormData assembly in `transcribe.ts`.
**Depends on:** none (independent of ElevenLabs)
**Patterns to follow:** auth check in `src/app/api/assistant/route.ts`; env access pattern.
**Verification:** Record a short clip in the app, confirm an accurate transcript returns.

### Unit 6: Mic capture + voice-activity detection hook

**Goal:** Capture the user's speech and detect when they've stopped, plus expose a live level
for the visualizer.
**Files:** `src/app/(app)/assistant/voice/useMicCapture.ts` (new).
**Approach:** `getUserMedia({ audio: true })`, feed the stream to both a `MediaRecorder`
(accumulate chunks → final `Blob`) and an `AnalyserNode`. Compute RMS each animation frame;
detect speech onset above a threshold, then silence below it for ~1.2s ⇒ finalize and resolve
the blob. Expose `start()`, `stop()`, an `onUtterance(blob)` callback, and a `level` ref for the
visualizer. Handle permission denial and missing-device errors with typed results. Tear down
tracks/contexts on stop.
**Tests:** Logic-only unit test of the silence-threshold state machine (feed synthetic
RMS sequences → assert onset/finalize timing). Browser audio itself is covered by manual QA.
**Depends on:** none
**Verification:** Manual: speak, see the level move, confirm finalize fires ~1.2s after you stop.

### Unit 7: TTS playback queue + analyser hook

**Goal:** Play synthesized sentence clips back-to-back smoothly and expose a level for the
visualizer.
**Files:** `src/app/(app)/assistant/voice/useAudioPlayback.ts` (new).
**Approach:** A FIFO queue of audio sources. `enqueue(stream|blob)` decodes/streams into a
shared `AudioContext`, routes through an `AnalyserNode` → destination, plays sequentially.
Expose `level` ref, `isSpeaking`, `stopAll()` (for barge-in / close), and an `onDrained`
callback (queue empty ⇒ turn over). Handle autoplay-policy gotchas by creating/resuming the
`AudioContext` on the user gesture that opens voice mode.
**Tests:** Logic-only unit test of queue ordering/draining with mocked players. Audio output
covered by manual QA.
**Depends on:** none
**Verification:** Manual: enqueue three clips, hear them play in order without gaps; `stopAll`
cuts immediately.

### Unit 8: Voice session state machine hook

**Goal:** The orchestrator that ties capture → transcribe → assistant stream → sentence chunk →
TTS → playback into a coherent hands-free loop with barge-in.
**Files:** `src/app/(app)/assistant/voice/useVoiceSession.ts` (new).
**Approach:** Explicit state machine `idle → listening → transcribing → thinking → speaking →
listening`. On utterance blob: POST to `/api/assistant/transcribe`, append the user turn to
shared history, POST history to `/api/assistant`, read the NDJSON stream, feed `text` deltas
through the `SentenceChunker`, `toSpeakable` each sentence, POST to `/api/assistant/speak`, and
`enqueue` the audio. On `proposal` events, surface the confirm card (do NOT auto-commit) and
speak the preview. When playback drains and the stream is `done`, return to `listening`.
Barge-in: keep a light VAD active during `speaking`; on detected speech, `stopAll()` and go to
`listening`. Expose `state`, `captions`, `level` (mic level while listening / playback level
while speaking), `start()`, `stop()`, and the current proposal (if any).
**Tests:** Unit test transitions with mocked sub-hooks/fetch: utterance→transcribing→thinking,
proposal pauses in a confirm state, barge-in cancels speaking. Verify history shape matches
`/api/assistant` contract (ends on user turn, ≤40 messages).
**Depends on:** Units 3, 6, 7 (and routes from 4, 5)
**Patterns to follow:** stream consumption in `AssistantChat.tsx:108-150`; history-building in
its `send()`.
**Verification:** Manual end-to-end: speak a read query, hear a spoken answer, loop continues.

### Unit 9: Audio-reactive visualizer

**Goal:** The "face" — a glowing orb/waveform that pulses to whoever is speaking.
**Files:** `src/app/(app)/assistant/voice/AudioVisualizer.tsx` (new).
**Approach:** A `<canvas>` driven by `requestAnimationFrame`, reading a `level` (and optional
frequency data) prop. Render a claude.ai-style reactive form: a soft radial glow + concentric
amplitude rings (or a radial bar ring) that scale/brighten with `level`. Color strictly from
design tokens (`--accent`, surfaces); distinct subtle states for listening vs speaking vs
thinking (e.g. idle shimmer while thinking). Respect `prefers-reduced-motion` (fall back to a
gentle pulse). Clean up the RAF on unmount. No external libs.
**Tests:** Light render test (mounts, sets up canvas, tears down RAF). Visual quality is a
manual/design-review check against DESIGN.md.
**Depends on:** none (consumes a numeric `level`)
**Patterns to follow:** design tokens per `DESIGN.md` / `src/styles/tokens/*`.
**Verification:** Manual: orb visibly tracks mic level while listening and TTS while speaking.

### Unit 10: Voice mode overlay UI

**Goal:** The full-screen talking surface that hosts the visualizer, captions, state, and
controls.
**Files:** `src/app/(app)/assistant/voice/VoiceOverlay.tsx` (new).
**Approach:** A full-screen overlay (portal/fixed) opened from the chat. Centerpiece is
`AudioVisualizer`; shows live captions (user + assistant), the current state label
("Listening…", "Thinking…", "Speaking…"), a mute/pause toggle, and a prominent End button.
When a write proposal is pending, render the existing confirm card (reuse the proposal UI shape
from `AssistantChat.tsx`) with a tap-to-confirm button; optionally accept a spoken "confirm" /
"cancel" matched against the pending proposal. All driven by `useVoiceSession`. Styling via
design tokens + inline `CSSProperties`, consistent with `AssistantChat.tsx`. Handle errors
(mic denied, voice disabled) with a clear inline message + a "switch to text" exit.
**Tests:** Render test for each state (listening/thinking/speaking/proposal/error) with a mocked
session hook.
**Depends on:** Units 8, 9
**Patterns to follow:** proposal card + token styles in `AssistantChat.tsx`; design tokens.
**Verification:** Manual: open overlay, full loop works, End returns to chat cleanly.

### Unit 11: Wire voice mode into AssistantChat

**Goal:** Launch voice mode from the chat and share conversation history both ways.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx` (modify).
**Approach:** Add a "Talk" entry point (mic button near the input). Clicking it creates/resumes
the `AudioContext` (autoplay gesture) and opens `VoiceOverlay`, passing the current `items`
history in and merging the voice turns back into `items` on close so the conversation is
continuous across modes. Hide/disable the button gracefully when voice is disabled
(`voiceEnabled` flag surfaced via a small `/api/assistant/voice-status` check or a public env
flag). Keep all existing text-chat behavior intact.
**Tests:** Render test: button present when enabled, absent/disabled when not; opening sets
overlay state. Regression: existing send/stream path untouched.
**Depends on:** Unit 10
**Patterns to follow:** existing state/handlers in `AssistantChat.tsx`.
**Verification:** Manual: start typing, switch to voice, switch back — history is continuous.

### Unit 12: Docs, env wiring, end-to-end QA checklist

**Goal:** Make it runnable by the next person and verified end-to-end.
**Files:** `.env.example` (confirm all new keys documented), `AGENTS.md` (modify — short "Voice
mode" subsection: which keys, which routes, browser requirements), `docs/` QA notes (new short
checklist file).
**Approach:** Document `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID` and
that STT reuses `OPENAI_API_KEY`. Note mic permission + HTTPS requirement and supported
browsers. Write the manual QA checklist (see Test Strategy). Copy the user's ElevenLabs key
into the local `.env` (the user does this; never commit it).
**Tests:** n/a (docs).
**Depends on:** Units 1–11
**Verification:** A fresh `.env` from `.env.example` + keys → voice mode works following the
checklist.

## Test Strategy

**Unit tests (pure logic — the high-value, automatable core):**
- `speech.ts` normalization (Unit 2), `sentence-chunker.ts` boundaries incl. decimals/abbrevs
  (Unit 3), VAD silence state machine (Unit 6), playback queue ordering/drain (Unit 7), voice
  session transitions with mocked deps (Unit 8), config defaults/gate (Unit 1).
- Route tests: `speak` and `transcribe` for auth (401), validation (400), happy path with
  mocked upstream calls (Units 4, 5).

**Integration:** voice session hook against mocked `fetch` for `/transcribe`, `/api/assistant`
(NDJSON), and `/speak`, asserting the full turn sequence and barge-in.

**Manual verification (browser audio can't be unit-tested):**
1. Grant mic permission; open voice mode → visualizer appears in `listening` state.
2. Say "what's the latest Brix reading for Block A" → captions show your words → assistant
   thinks → speaks the answer, orb pulses to the voice → returns to listening.
3. Speak a write request ("log 24.5 Brix on Block A") → assistant speaks the proposal + shows
   the confirm card → it does NOT commit until you tap confirm (and/or say "confirm").
4. Barge-in: interrupt mid-reply → playback stops, it listens.
5. Deny mic / unset `ELEVENLABS_API_KEY` → clear fallback message, text chat still works.
6. Close voice mode → spoken turns appear in the text transcript.
7. Re-run `/qa` and a `/design-review` pass on the overlay against DESIGN.md.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Browser autoplay policy blocks TTS audio | HIGH | HIGH | Create/resume `AudioContext` on the user gesture that opens voice mode (Unit 7/11); test on Chrome + Safari. |
| VAD mis-fires (cuts user off or never ends) | MED | HIGH | Tunable threshold + min-speech/hang times; show live mic level so the user sees it listening; allow tap-to-stop. |
| Sentence-streamed TTS sounds choppy across clips | MED | MED | Chunk on full sentences only (Unit 3); gapless queue playback (Unit 7); consider small lookahead. |
| Latency stacks up (STT + LLM + TTS per turn) | MED | MED | Stream sentences (first audio ~1s); use a low-latency ElevenLabs model (`turbo`/`flash`); `gpt-4o-transcribe` is fast. |
| Voice "confirm" could trigger an unintended write | LOW | HIGH | Default to tap-confirm; spoken confirm must match the specific pending proposal and still passes signed-token + single-use nonce server-side. No new bypass. |
| ElevenLabs cost/rate limits | LOW | MED | Cap sentence length + per-session turns; env flag to disable; reuse existing key with its quota. |
| iOS Safari Web Audio quirks | MED | MED | Feature-detect; document supported browsers; graceful fallback to text. |
| Mic/audio teardown leaks (contexts, tracks, RAF) | MED | LOW | Centralized cleanup in hooks on stop/unmount; verify in manual QA. |

## Success Criteria

- [ ] Opening voice mode starts a hands-free loop: listen → speak → transcribe → think → reply
      aloud → listen, with no typing.
- [ ] Transcription is server-side (OpenAI) and handles wine jargon noticeably better than
      browser STT.
- [ ] Assistant speaks via ElevenLabs, sentence-streamed, first audio within ~1–1.5s of the
      reply starting.
- [ ] Visualizer pulses to mic level while listening and to TTS while speaking, using design
      tokens, and respects `prefers-reduced-motion`.
- [ ] Voice reuses the existing `/api/assistant` stream and tool loop; history is shared with
      text chat.
- [ ] Write proposals are spoken + shown and require explicit confirmation; the signed-token /
      single-use-nonce guarantees are unchanged.
- [ ] Barge-in interrupts playback and resumes listening.
- [ ] Graceful fallback when mic denied or voice disabled; secrets never reach the client.
- [ ] All unit/route tests pass; no regressions in existing tests; `npm run build` + `npm run
      lint` clean.
