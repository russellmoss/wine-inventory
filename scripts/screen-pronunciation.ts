/**
 * Plan 091 Unit 2 — screen candidates by round-tripping them through TTS then STT.
 *
 *   npm run screen:pronunciation -- --validate          # 20 known terms, proves the method
 *   npm run screen:pronunciation -- --limit 100         # screen mined candidates
 *   npm run screen:pronunciation -- --lexicon           # re-screen WITH the lexicon applied
 *
 * Speak the term inside a carrier sentence, transcribe the audio back, and check
 * whether the term survived. If the engine mispronounces it badly, Scribe hears
 * something else and the term fails.
 *
 * THIS IS A SCREEN, NOT AN ORACLE. Scribe can "correct" a bad pronunciation back to
 * the right spelling (false negative) or mis-hear a perfectly-spoken word (false
 * positive). It exists to turn ~400 manual listens into ~40. The ear pass in Unit 7
 * is still the acceptance gate.
 *
 * Costs pennies: Scribe is $0.22/hr and these clips are ~3 seconds.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { synthesizeStream } from "@/lib/voice/elevenlabs";
import { transcribeAudio } from "@/lib/voice/transcribe";
import { ttsEnabled, sttEnabled } from "@/lib/voice/config";
import { applyLexicon } from "@/lib/voice/lexicon";
import {
  carrierSentence,
  summarize,
  termSurvived,
  type CarrierStyle,
  type ScreenVerdict,
} from "./screen-pronunciation-match";

const OUT_DIR = "docs/kb-eval";
const CANDIDATES_FILE = `${OUT_DIR}/pronunciation-candidates.json`;
const CONCURRENCY = 4;

/**
 * The validation set. Ten terms the engine has no reason to get wrong, and ten it is
 * reported or expected to mangle. If the screen cannot separate these two piles, the
 * method does not work and the fallback is a ranked listening pass.
 */
const KNOWN_GOOD = [
  "tank", "barrel", "harvest", "bottle", "cellar",
  "filter", "sugar", "water", "pump", "vineyard",
];
const KNOWN_HARD = [
  "Syrah", "Viognier", "Gewürztraminer", "Mourvèdre", "Saccharomyces",
  "Brettanomyces", "veraison", "bâtonnage", "Oenococcus", "Riesling",
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

async function screenTerm(
  term: string,
  useLexicon: boolean,
  carrier: CarrierStyle,
): Promise<ScreenVerdict> {
  const sentence = carrierSentence(term, carrier);
  const spoken = useLexicon ? applyLexicon(sentence) : sentence;
  const audio = await collectStream(await synthesizeStream(spoken));
  const blob = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });
  const transcript = await transcribeAudio(blob, "screen.mp3");
  return { term, transcript, survived: termSurvived(term, transcript) };
}

/** Bounded concurrency — this hits a paid API, and a 400-wide fan-out is rude. */
async function screenAll(
  terms: string[],
  useLexicon: boolean,
  carrier: CarrierStyle = "wine",
): Promise<ScreenVerdict[]> {
  const out: ScreenVerdict[] = [];
  let index = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= terms.length) return;
      try {
        out.push(await screenTerm(terms[i], useLexicon, carrier));
      } catch (err) {
        out.push({
          term: terms[i],
          transcript: `ERROR: ${(err as Error).message}`,
          survived: true, // fail SAFE: an API error must not look like a mispronunciation
        });
      }
      done++;
      process.stdout.write(`\r  screened ${done}/${terms.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, terms.length) }, worker));
  process.stdout.write("\n");
  return out;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function main() {
  if (!ttsEnabled() || !sttEnabled()) {
    throw new Error("ELEVENLABS_API_KEY is not set; the screen needs both TTS and STT.");
  }

  const useLexicon = flag("--lexicon");

  if (flag("--validate")) {
    console.log("VALIDATION RUN — can a TTS->STT round trip tell these two piles apart?\n");

    const ci = process.argv.indexOf("--carrier");
    const carrier = (ci !== -1 ? process.argv[ci + 1] : "wine") as CarrierStyle;
    console.log(`  carrier style: ${carrier}`);
    const good = await screenAll(KNOWN_GOOD, false, carrier);
    const hard = await screenAll(KNOWN_HARD, false, carrier);

    const goodSummary = summarize(good);
    const hardSummary = summarize(hard);

    console.log("\nKNOWN-GOOD (expect nearly all to survive):");
    for (const v of good.sort((a, b) => a.term.localeCompare(b.term))) {
      console.log(`  ${v.survived ? "pass" : "FAIL"}  ${v.term.padEnd(16)} heard: ${v.transcript}`);
    }
    console.log("\nKNOWN-HARD (expect many to fail):");
    for (const v of hard.sort((a, b) => a.term.localeCompare(b.term))) {
      console.log(`  ${v.survived ? "pass" : "FAIL"}  ${v.term.padEnd(16)} heard: ${v.transcript}`);
    }

    const separation = hardSummary.failureRate - goodSummary.failureRate;
    console.log("\nSEPARATION");
    console.log(`  known-good failure rate: ${(goodSummary.failureRate * 100).toFixed(0)}%`);
    console.log(`  known-hard failure rate: ${(hardSummary.failureRate * 100).toFixed(0)}%`);
    console.log(`  separation:              ${(separation * 100).toFixed(0)} points`);
    console.log(
      separation >= 0.3
        ? "\n  VERDICT: the screen discriminates. Proceed to screening the mined candidates."
        : "\n  VERDICT: WEAK. The screen cannot reliably tell these apart — do NOT trust it to\n" +
            "  triage 400 candidates. Fall back to a frequency-ranked listening pass.",
    );

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      `${OUT_DIR}/pronunciation-screen-validation.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          knownGood: good,
          knownHard: hard,
          goodFailureRate: goodSummary.failureRate,
          hardFailureRate: hardSummary.failureRate,
          separation,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`\n  -> ${OUT_DIR}/pronunciation-screen-validation.json`);
    return;
  }

  const limit = numArg("--limit", 400);
  const raw = JSON.parse(readFileSync(CANDIDATES_FILE, "utf8")) as {
    candidates: { term: string }[];
  };
  const terms = raw.candidates.map((c) => c.term).slice(0, limit);
  const dropped = raw.candidates.length - terms.length;

  console.log(`Screening ${terms.length} candidates${useLexicon ? " WITH lexicon applied" : ""}`);
  if (dropped > 0) console.log(`  (${dropped} candidates NOT screened — --limit ${limit})`);

  const ci2 = process.argv.indexOf("--carrier");
  const verdicts = await screenAll(terms, useLexicon, (ci2 !== -1 ? process.argv[ci2 + 1] : "wine") as CarrierStyle);
  const { failed, failureRate } = summarize(verdicts);

  const outFile = `${OUT_DIR}/pronunciation-screen${useLexicon ? "-with-lexicon" : ""}.json`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    outFile,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), useLexicon, screened: verdicts.length, failed: failed.length, failureRate, verdicts },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n  screened: ${verdicts.length}`);
  console.log(`  failed:   ${failed.length} (${(failureRate * 100).toFixed(1)}%)`);
  console.log(`  -> ${outFile}`);
  console.log("\nFailures (candidates for a lexicon rule):");
  for (const v of failed.slice(0, 60)) {
    console.log(`  ${v.term.padEnd(28)} heard: ${v.transcript}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
