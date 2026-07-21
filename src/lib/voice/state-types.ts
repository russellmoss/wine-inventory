/**
 * The voice loop's states, in the order they cycle:
 *
 *   idle ──start──> listening ──utterance──> transcribing ──> thinking ──> speaking ─┐
 *                       ^                                                            │
 *                       └────────────────── reply finished / interrupted ────────────┘
 *
 * `error` is terminal for the session (the user switches to text or restarts).
 *
 * Declared here rather than in the hook so pure `src/lib/voice/*` modules can depend
 * on it without importing from a "use client" component file.
 */
export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
