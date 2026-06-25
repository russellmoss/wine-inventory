// Split a streaming token feed into complete sentences so each can be sent to
// TTS the moment it's done — that's what makes the assistant start talking ~1s
// in instead of after the whole reply. The hard part is NOT cutting mid-sentence
// on decimals ("24.5"), abbreviations ("Dr.", "vs."), or ellipses.
//
// Pure and client-side: useVoiceSession feeds text deltas through push() and
// pipes whatever sentences come back to the speak route. flush() drains the tail
// when the assistant stream ends.

// Lowercased tokens that end in "." but don't end a sentence.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "st", "vs", "etc", "approx", "no", "fig",
  "e.g", "i.e", "a.m", "p.m", "u.s",
]);

// A minimum sentence length guards against emitting fragments on stray
// punctuation (e.g. a lone "OK." is fine, but we don't want "A." alone).
const MIN_SENTENCE_LEN = 2;

export class SentenceChunker {
  private buffer = "";

  /**
   * Append a text delta and return any sentences completed by it. Incomplete
   * trailing text stays buffered until a later push (or flush) completes it.
   */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];

    let sentence: string | null;
    while ((sentence = this.takeSentence()) !== null) {
      out.push(sentence);
    }
    return out;
  }

  /** Return and clear whatever remains (the final partial sentence at stream end). */
  flush(): string | null {
    const tail = this.buffer.trim();
    this.buffer = "";
    return tail.length > 0 ? tail : null;
  }

  // Find the first sentence boundary in the buffer and split it off. Returns null
  // when the buffer holds no complete sentence yet.
  private takeSentence(): string | null {
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch !== "." && ch !== "!" && ch !== "?") continue;

      // Consume a run of terminators + closing quotes/brackets ("?!", '."').
      let end = i;
      while (end + 1 < this.buffer.length && /[.!?]/.test(this.buffer[end + 1])) end++;
      while (end + 1 < this.buffer.length && /["'”’)\]]/.test(this.buffer[end + 1])) end++;

      const next = this.buffer[end + 1];

      // Need whitespace (or end-of-buffer) after the boundary to be confident the
      // sentence is actually over. If there's no next char yet, wait for more.
      if (next === undefined) return null;
      if (!/\s/.test(next)) continue;

      // Decimal guard: digit "." digit (e.g. "24.5") is not a boundary.
      if (ch === "." && /\d/.test(this.buffer[i - 1] ?? "") && /\d/.test(this.buffer[i + 1] ?? "")) {
        continue;
      }

      // Abbreviation guard: the word ending at this "." is a known abbreviation.
      if (ch === "." && this.endsWithAbbreviation(i)) continue;

      const candidate = this.buffer.slice(0, end + 1).trim();
      if (candidate.length < MIN_SENTENCE_LEN) continue;

      this.buffer = this.buffer.slice(end + 1).replace(/^\s+/, "");
      return candidate;
    }
    return null;
  }

  // Is the token immediately before index `dotIndex` an abbreviation?
  private endsWithAbbreviation(dotIndex: number): boolean {
    let start = dotIndex - 1;
    while (start >= 0 && /[A-Za-z.]/.test(this.buffer[start])) start--;
    const word = this.buffer.slice(start + 1, dotIndex).toLowerCase();
    return ABBREVIATIONS.has(word);
  }
}
