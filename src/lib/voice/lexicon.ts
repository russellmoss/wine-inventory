// Pronunciation lexicon for text-to-speech. Rewrites domain vocabulary into
// respellings the TTS engine reads correctly: "Syrah" -> "see-rah".
//
// WHY RESPELLING AND NOT PHONEMES: ElevenLabs pronunciation-dictionary phoneme
// tags (IPA/CMU) only work on `eleven_flash_v2` and `eleven_v3`. We run
// `eleven_flash_v2_5` (see config.ts) because conversational latency is worth more
// than phonetic precision. Flash v2.5 SILENTLY IGNORES phoneme rules — they would
// look configured and change nothing. Alias respelling works on every model, so
// that is the lever, and doing it here keeps it pure, testable, and free.
//
// WHAT EARNS A RULE: only a term the engine demonstrably gets WRONG. A rule on a
// word that was already pronounced correctly can only move it in one direction.
// See scripts/screen-pronunciation.ts for how failures are identified.
//
// Pure, dependency-free, isomorphic — same constraints as speech.ts, because this
// runs inside toSpeakable() which executes on BOTH the client and the speak route.

/** A literal term and how it should be spoken. Matching is case- and accent-insensitive. */
export type TermRule = {
  term: string;
  spoken: string;
  /** Optional provenance: why this term earned a rule. */
  note?: string;
};

/**
 * A generated shape (lot code, vessel code, strain code) that cannot be enumerated.
 *
 * `pattern` is raw regex source and MUST NOT contain a capturing group — use `(?:...)`.
 * The compiler wraps every rule in exactly one group so it can tell which alternative
 * fired; an inner capture would shift those indices and silently mis-dispatch. The
 * compiler throws on one rather than letting it corrupt speech at runtime.
 */
export type PatternRule = {
  pattern: string;
  label: string;
  spoken: (match: string) => string;
  /**
   * A concrete string this pattern should match. Required, not decorative: a
   * generated shape has no literal form for the idempotency and cascade guards to
   * probe, so without an example the rule is effectively untested.
   */
  example: string;
  note?: string;
};

/**
 * A term whose pronunciation is specified in ACTUAL PHONEMES, not a respelling.
 *
 * This is the mechanism that works. Respelling ("Syrah" -> "see-rah") is a hope that the
 * model's letter-to-sound guesser lands somewhere good; it was tried on 9 terms and
 * failed on 8. A phoneme tag states the sounds and the stress outright.
 *
 * Requires `eleven_flash_v2` — `eleven_flash_v2_5` accepts the tag and silently ignores
 * it. See the model comment in config.ts. ElevenLabs' own guidance is that CMU Arpabet
 * is more predictable than IPA in their implementation, so that is the default.
 *
 * ONE WORD PER RULE. The tag is a single-word construct, so a binomial like
 * "Saccharomyces cerevisiae" is two rules, not one, and the matcher tags each half.
 */
export type PhonemeRule = {
  term: string;
  /** e.g. "S IH0 R AA1" — CMU Arpabet, digits are stress (0 none, 1 primary, 2 secondary). */
  phoneme: string;
  alphabet?: "cmu-arpabet" | "ipa";
  note?: string;
};

export type LexiconRule = TermRule | PatternRule | PhonemeRule;

export function isPatternRule(rule: LexiconRule): rule is PatternRule {
  return "pattern" in rule;
}

export function isPhonemeRule(rule: LexiconRule): rule is PhonemeRule {
  return "phoneme" in rule;
}

/** Render a phoneme rule as the SSML the TTS understands. */
export function phonemeTag(rule: PhonemeRule): string {
  const alphabet = rule.alphabet ?? "cmu-arpabet";
  return `<phoneme alphabet="${alphabet}" ph="${rule.phoneme}">${rule.term}</phoneme>`;
}

/**
 * Matches a complete, already-rendered phoneme tag.
 *
 * This is prepended to the alternation as the FIRST alternative, and it is what makes
 * phoneme rules idempotent. The rendered tag CONTAINS the original word, so on a second
 * pass the bare-term rule would match that inner text and nest a tag inside itself —
 * and `toSpeakable` genuinely does run twice on every spoken sentence. Because the
 * matcher is a single leftmost-first pass, consuming the whole tag here means its
 * contents are never re-scanned.
 */
const RENDERED_TAG_SOURCE = "<phoneme\\b[^>]*>[^<]*</phoneme>";

/** Strip combining marks so "Mourvèdre" and "Mourvedre" fold to the same base. */
export function foldDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

// Base letter -> the accented forms that should also match it. The `i` flag covers
// the uppercase forms, so only lowercase is listed.
const ACCENT_VARIANTS: Record<string, string> = {
  a: "àáâãäå",
  c: "ç",
  e: "èéêë",
  i: "ìíîï",
  n: "ñ",
  o: "òóôõö",
  u: "ùúûü",
  y: "ýÿ",
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the regex source for a literal term.
 *
 * Accent-tolerant in BOTH directions (the assistant writes "Gewürztraminer" or
 * "Gewurztraminer" depending on its source), whitespace-tolerant between words, and
 * bounded by Unicode letter/digit lookarounds rather than `\b` — `\b` is ASCII-only,
 * so it misbehaves at the edges of a term that starts or ends with an accented letter.
 */
export function buildTermSource(term: string): string {
  const folded = foldDiacritics(term.trim());
  const body = escapeRegex(folded)
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const variants = ACCENT_VARIANTS[lower];
      if (variants) return `[${lower}${variants}]`;
      return ch;
    })
    .join("")
    // A multi-word term should survive whatever spacing the model emitted.
    .replace(/(\\?\s)+/g, "\\s+");
  return `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
}

/** Reject `(` that opens a capturing group (not escaped, not `(?...`). */
function hasCapturingGroup(source: string): boolean {
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      i++; // skip the escaped character
      continue;
    }
    if (source[i] === "(" && source[i + 1] !== "?") return true;
  }
  return false;
}

export type CompiledLexicon = {
  regex: RegExp;
  /** Rules in alternation order; rule i owns capture group i+1. */
  order: LexiconRule[];
};

/**
 * Compile the rule table into ONE alternation regex applied in a SINGLE pass.
 *
 * Single-pass is the whole design. Sequential per-term `.replace()` calls let one
 * rule's output be re-scanned by the next rule, which is how a lexicon quietly
 * turns into a cascade generator. A single pass cannot re-read what it just wrote.
 *
 * Alternation is leftmost-first, so sorting the alternatives longest-first is what
 * makes "Cabernet Sauvignon" win over "Cabernet".
 */
export function compileLexicon(rules: LexiconRule[]): CompiledLexicon | null {
  if (rules.length === 0) return null;

  const order = [...rules].sort((a, b) => {
    // Generated codes are narrow and unambiguous; let them bind before words.
    const aPattern = isPatternRule(a);
    const bPattern = isPatternRule(b);
    if (aPattern !== bPattern) return aPattern ? -1 : 1;
    if (aPattern && bPattern) return b.pattern.length - a.pattern.length;
    return termOf(b).length - termOf(a).length;
  });

  const sources = order.map((rule) => {
    if (isPatternRule(rule)) {
      if (hasCapturingGroup(rule.pattern)) {
        throw new Error(
          `Lexicon pattern "${rule.label}" contains a capturing group. Use (?:...) — ` +
            `an inner capture shifts the group indices the compiler dispatches on.`,
        );
      }
      return `(${rule.pattern})`;
    }
    return `(${buildTermSource(termOf(rule))})`;
  });

  // The tag guard is alternative ZERO. Leftmost-first alternation means an
  // already-rendered tag is consumed whole before any term rule can see inside it.
  return {
    regex: new RegExp([`(${RENDERED_TAG_SOURCE})`, ...sources].join("|"), "giu"),
    order,
  };
}

/** The literal term a non-pattern rule matches on. */
function termOf(rule: LexiconRule): string {
  return isPatternRule(rule) ? rule.label : rule.term;
}

/**
 * The shipped rule table.
 *
 * EVERY entry here failed a human listening pass. Nothing is in this table on theory.
 * The automated TTS->STT screen was built and rejected (see
 * docs/kb-eval/pronunciation-lexicon-audit.md) and the ear pass proved why: the screen
 * PASSED Syrah, Saccharomyces, Gewürztraminer and Brettanomyces, all of which are wrong,
 * and FLAGGED veraison and bâtonnage, both of which the engine says correctly. Trusting
 * it would have broken working words and left the reported ones broken.
 *
 * So: do not add a term here because it looks foreign or hard. Add it after hearing it.
 * `npm run sample:pronunciation` renders the batch; `-- --lexicon` renders it with these
 * rules applied, which is how you check a respelling helped instead of hurt.
 *
 * Respellings are lowercase and hyphenated on purpose. ALL-CAPS syllables read as
 * initialisms or hard emphasis on some voices, which trades one wrong reading for another.
 */
export const LEXICON: LexiconRule[] = [
  // --- PHONEME rules: the actual sounds ------------------------------------
  // Every one of these first failed as a RESPELLING in the 2026-07-23 ear pass. A
  // respelling asks the model to guess; a phoneme tag tells it. CMU Arpabet, where the
  // trailing digit is stress: 1 primary, 2 secondary, 0 unstressed.

  // Grape varieties.
  { term: "Syrah", phoneme: "S IH0 R AA1", note: "ear pass #1; ticket #464. sih-RAH" },
  {
    term: "Gewürztraminer",
    phoneme: "G AH0 V ER1 T S T R AH0 M IY2 N ER0",
    note: "ear pass #11; the matcher also catches the unaccented spelling",
  },
  { term: "Sangiovese", phoneme: "S AE2 N JH OW0 V EY1 Z EY0", note: "ear pass #15" },

  // Microbiology. ONE WORD PER RULE — the tag is a single-word construct, so a binomial
  // is tagged half by half rather than as one phrase.
  {
    term: "Saccharomyces",
    phoneme: "S AE2 K ER0 OW0 M AY1 S IY2 Z",
    note: "ear pass #2; ticket #464",
  },
  { term: "cerevisiae", phoneme: "S EH2 R AH0 V IH1 S IY0 AY2", note: "ear pass #2" },
  { term: "Brettanomyces", phoneme: "B R EH2 T AH0 N OW0 M AY1 S IY2 Z", note: "ear pass #16" },
  { term: "Oenococcus", phoneme: "IY2 N OW0 K AA1 K AH0 S", note: "ear pass #17" },
  { term: "oeni", phoneme: "IY1 N IY0", note: "ear pass #17" },

  // Materials. "potassium" is deliberately absent — it is ordinary English and was not
  // flagged, and a rule on a word that is already right can only move it one way.
  { term: "metabisulfite", phoneme: "M EH2 T AH0 B AY0 S AH1 L F AY2 T", note: "ear pass #25" },
  { term: "Erbslöh", phoneme: "ER1 B Z L ER0", note: "ear pass #22; German supplier in Demo" },

  // --- ALIAS rule: an EXPANSION, not a phonetic ----------------------------
  // This is the one respelling that worked, and it worked because it is a different
  // mechanism: turning a written code into the words a person says, the same class of
  // thing as normalizeUnits turning "mg/L" into "milligrams per liter". Nothing here is
  // being sounded out.
  //
  // Deliberately NOT generalised into a pattern over strain codes: D254 and RC212 have
  // their own spoken conventions that are custom rather than arithmetic, and guessing
  // them ships a confident mispronunciation. They get rules when they get an ear pass.
  {
    term: "EC-1118",
    spoken: "E C eleven eighteen",
    note: "ear pass #24; the only respelling that passed. Industry convention, per Russell",
  },
];

// applyLexicon runs twice per spoken sentence (client + speak route), so the
// alternation regex is built once per table rather than once per call. Keyed on the
// array identity, which is stable for LEXICON and for a test's local table alike.
const compileCache = new WeakMap<LexiconRule[], CompiledLexicon | null>();

function compileCached(rules: LexiconRule[]): CompiledLexicon | null {
  const hit = compileCache.get(rules);
  if (hit !== undefined) return hit;
  const compiled = compileLexicon(rules);
  compileCache.set(rules, compiled);
  return compiled;
}

/**
 * Rewrite domain vocabulary in `text` into its spoken form.
 *
 * `rules` is injectable so the machinery can be tested independently of whatever
 * the shipped table currently holds.
 */
export function applyLexicon(text: string, rules: LexiconRule[] = LEXICON): string {
  const compiled = compileCached(rules);
  if (!compiled) return text;

  const { regex, order } = compiled;
  return text.replace(regex, (...args: unknown[]) => {
    const matched = args[0] as string;

    // Group 1 is the already-rendered-tag guard. Hand it back untouched: this is the
    // whole reason applying the lexicon twice does not nest tags inside themselves.
    if (args[1] !== undefined) return matched;

    // Every rule contributes exactly one group (inner captures are rejected at compile
    // time), so rule i owns group i+2 — the guard occupies group 1.
    for (let i = 0; i < order.length; i++) {
      if (args[i + 2] === undefined) continue;
      const rule = order[i];
      if (isPatternRule(rule)) return rule.spoken(matched);
      if (isPhonemeRule(rule)) return phonemeTag(rule);
      return rule.spoken;
    }
    return matched;
  });
}
