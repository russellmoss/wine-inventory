// Turn ONE finished assistant reply into the sequence of TTS requests that reads it
// aloud. This is the "speaker button" path (a completed message, read on demand) as
// opposed to the hands-free voice loop, which chunks a LIVE token stream through
// SentenceChunker as it arrives.
//
// Pure and isomorphic — no fetch, no audio, no DOM — so it is unit-testable under
// `environment: "node"` like the rest of src/lib/voice.
//
// Two things decide the shape:
//  - The FIRST chunk is deliberately just the first sentence. Synthesis latency is
//    per-request, so a short opener means audio starts in ~1s instead of after the
//    whole reply renders. Later chunks are batched, because by then we are playing
//    clip N while clip N+1 synthesizes and only throughput matters.
//  - Every chunk stays well under the speak route's own 1500-char cap, which SLICES
//    rather than rejects. A chunk that overran it would be silently truncated
//    mid-sentence and the listener would never know a clause went missing.

import { SentenceChunker } from "./sentence-chunker";
import { toSpeakable } from "./speech";

/** Target size of a batched chunk. Comfortably under the speak route's 1500-char slice. */
export const READ_ALOUD_MAX_CHUNK = 420;

/**
 * Total spoken characters we will synthesize for one message. A runaway reply
 * (a giant table dumped as prose) would otherwise fan out into dozens of paid
 * ElevenLabs calls on a single click. Anything past this is dropped, not sliced
 * mid-word — see `planSpeech`'s return contract.
 */
export const READ_ALOUD_MAX_TOTAL = 8000;

/**
 * Split `text` on whitespace WITHOUT ever cutting inside an SSML tag.
 *
 * The lexicon (applyLexicon, run last inside toSpeakable) wraps wine vocabulary in
 * inline `<phoneme>` tags. Splitting between the tag and its content would ship half
 * a tag to ElevenLabs, which reads the fragment out as literal text.
 */
function splitOutsideTags(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "<") depth++;
    if (ch === ">" && depth > 0) depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** Break one over-long sentence into ≤maxLen pieces at word boundaries. */
function hardSplit(sentence: string, maxLen: number): string[] {
  if (sentence.length <= maxLen) return [sentence];
  const out: string[] = [];
  let current = "";
  for (const word of splitOutsideTags(sentence)) {
    if (current && current.length + 1 + word.length > maxLen) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Plan the TTS requests for one assistant message.
 *
 * Returns speak-ready text chunks in playback order. Empty when there is nothing
 * speakable (a reply that was only a link, a citation, or an empty string).
 * Truncated — never sliced mid-word — once READ_ALOUD_MAX_TOTAL is reached.
 */
export function planSpeech(markdown: string): string[] {
  const text = toSpeakable(markdown ?? "").trim();
  if (!text) return [];

  const chunker = new SentenceChunker();
  const sentences = chunker.push(text);
  const tail = chunker.flush();
  if (tail) sentences.push(tail);

  // Every sentence, pre-split so no single unit can overrun a request.
  const units = sentences.flatMap((s) => hardSplit(s, READ_ALOUD_MAX_CHUNK));
  if (units.length === 0) return [];

  const chunks: string[] = [];
  let current = "";
  let total = 0;

  const commit = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const [i, unit] of units.entries()) {
    // +1 for the space this unit is joined on, so the budget counts what is actually
    // sent rather than the raw sentence lengths (which undercounts by one per join).
    const cost = total === 0 ? unit.length : unit.length + 1;
    if (total + cost > READ_ALOUD_MAX_TOTAL) break;
    total += cost;
    // First sentence goes out alone: it is the one whose latency the user feels.
    if (i === 0) {
      chunks.push(unit);
      continue;
    }
    if (current && current.length + 1 + unit.length > READ_ALOUD_MAX_CHUNK) commit();
    current = current ? `${current} ${unit}` : unit;
  }
  commit();

  return chunks;
}
