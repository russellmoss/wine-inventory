/**
 * Plan 091 Unit 7 — synthesize ONE audio file of numbered terms for a listening pass.
 *
 *   npm run sample:pronunciation                 # baseline, no lexicon
 *   npm run sample:pronunciation -- --lexicon    # after rules exist, to hear the fix
 *   npm run sample:pronunciation -- --out path.mp3
 *
 * The automated TTS->STT screen was built and REJECTED (see
 * docs/kb-eval/pronunciation-lexicon-audit.md): Scribe repairs the mispronunciation it
 * was supposed to detect, so it missed Syrah and Saccharomyces while flagging a
 * perfectly-said "cellar" as the homophone "seller". A human ear is the only reliable
 * detector, so the job here is to make that ear pass as cheap as possible: one file,
 * numbered items, ~90 seconds, report back by number.
 *
 * Terms are grounded in Demo Winery's ACTUAL varieties and materials plus the two terms
 * the ticket names, not in a guess at what a winery might stock.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { synthesizeStream } from "@/lib/voice/elevenlabs";
import { ttsEnabled } from "@/lib/voice/config";
import { applyLexicon } from "@/lib/voice/lexicon";

/**
 * Batch one of the listening pass. Ordered so the highest-stakes terms land early,
 * while attention is freshest: the ticket's own examples, then Demo's real varieties,
 * then the classic offenders, then materials and codes.
 */
const TERMS: string[] = [
  // The ticket's named examples.
  "Syrah",
  "Saccharomyces cerevisiae",
  // Demo Winery's actual varieties.
  "Meunier",
  "Solaris",
  "Sauvignon Blanc",
  "Cabernet Sauvignon",
  "Pinot Noir",
  "Chardonnay",
  "Merlot",
  // Varieties a winery says constantly that TTS classically trips on.
  "Viognier",
  "Gewürztraminer",
  "Mourvèdre",
  "Grenache",
  "Riesling",
  "Sangiovese",
  // Microbiology.
  "Brettanomyces",
  "Oenococcus oeni",
  // Cellar process vocabulary.
  "veraison",
  "bâtonnage",
  "malolactic",
  "Brix",
  // Demo's actual materials.
  "Erbslöh",
  "Lalvin",
  "EC-1118",
  "potassium metabisulfite",
  "Amorim",
  // A generated code, read as the app emits it.
  "lot 2026-SY-2",
];

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return Buffer.concat(parts);
}

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  if (!ttsEnabled()) throw new Error("ELEVENLABS_API_KEY is not set.");

  const useLexicon = process.argv.includes("--lexicon");
  const out = argValue("--out", `pronunciation-sample${useLexicon ? "-with-lexicon" : ""}.mp3`);

  // Numbered so the listener can report back "4, 9 and 17 are wrong" without
  // transcribing anything. A full stop after the number gives the voice a beat.
  const script = TERMS.map((term, i) => {
    const spoken = useLexicon ? applyLexicon(term) : term;
    return `${i + 1}. ${spoken}.`;
  }).join(" ");

  console.log(`Synthesizing ${TERMS.length} terms${useLexicon ? " WITH lexicon applied" : ""}\n`);
  TERMS.forEach((term, i) => {
    const spoken = useLexicon ? applyLexicon(term) : term;
    const shown = useLexicon && spoken !== term ? `${term}   ->  spoken as "${spoken}"` : term;
    console.log(`  ${String(i + 1).padStart(2)}. ${shown}`);
  });

  const audio = await collectStream(await synthesizeStream(script));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, audio);

  console.log(`\n  -> ${out}  (${(audio.length / 1024).toFixed(0)} KB)`);
  console.log("\nPlay it once, then tell me which NUMBERS sound wrong.");
  console.log("Only those get a lexicon rule — a rule on a word that was already right");
  console.log("can only move it in one direction.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
