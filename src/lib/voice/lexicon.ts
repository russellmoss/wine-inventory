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

export type LexiconRule = TermRule | PatternRule;

export function isPatternRule(rule: LexiconRule): rule is PatternRule {
  return "pattern" in rule;
}

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
    return (b as TermRule).term.length - (a as TermRule).term.length;
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
    return `(${buildTermSource(rule.term)})`;
  });

  return { regex: new RegExp(sources.join("|"), "giu"), order };
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
  // --- Grape varieties -----------------------------------------------------
  { term: "Syrah", spoken: "see-rah", note: "ear pass 2026-07-23 #1; named in ticket #464" },
  {
    term: "Gewürztraminer",
    spoken: "guh-verts-trah-mee-ner",
    note: "ear pass #11; matches the unaccented spelling too",
  },
  { term: "Sangiovese", spoken: "san-joh-vay-zeh", note: "ear pass #15" },

  // --- Microbiology --------------------------------------------------------
  // The binomials come first in the table for readability; compileLexicon sorts by
  // length anyway, so "Saccharomyces cerevisiae" cannot lose to bare "Saccharomyces".
  {
    term: "Saccharomyces cerevisiae",
    spoken: "sack-a-roh-my-seez sair-uh-vizz-ee-eye",
    note: "ear pass #2; named in ticket #464",
  },
  { term: "Saccharomyces", spoken: "sack-a-roh-my-seez", note: "bare genus, said on its own" },
  { term: "cerevisiae", spoken: "sair-uh-vizz-ee-eye", note: "epithet after an abbreviated genus" },
  { term: "Brettanomyces", spoken: "bret-an-oh-my-seez", note: "ear pass #16" },
  { term: "Oenococcus oeni", spoken: "ee-noh-kok-us ee-nee", note: "ear pass #17" },
  { term: "Oenococcus", spoken: "ee-noh-kok-us", note: "bare genus, said on its own" },

  // --- Materials and additives --------------------------------------------
  {
    term: "potassium metabisulfite",
    spoken: "puh-tass-ee-um met-a-by-sul-fite",
    note: "ear pass #25",
  },
  { term: "metabisulfite", spoken: "met-a-by-sul-fite", note: "said without the potassium" },
  { term: "Erbslöh", spoken: "erbs-luh", note: "ear pass #22; German supplier in Demo's materials" },

  // --- Yeast strain codes --------------------------------------------------
  // "E C eleven eighteen" is how the industry says it, per Russell. Deliberately NOT
  // generalised into a pattern rule: D254 and RC212 have their own spoken conventions
  // ("D two fifty four", "R C two twelve") that are convention, not arithmetic, and
  // guessing them is how you ship a confident mispronunciation. They get rules when
  // they get an ear pass.
  {
    term: "EC-1118",
    spoken: "E C eleven eighteen",
    note: "ear pass #24; industry convention, confirmed by Russell",
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
    // Every rule contributes exactly one group (inner captures are rejected at
    // compile time), so group i+1 maps to rule i.
    for (let i = 0; i < order.length; i++) {
      if (args[i + 1] === undefined) continue;
      const rule = order[i];
      return isPatternRule(rule) ? rule.spoken(matched) : rule.spoken;
    }
    return matched;
  });
}
