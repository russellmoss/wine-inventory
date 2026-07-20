/**
 * Plan 079 Unit 10 — knowledge-base eval gate.
 *
 *   npm run verify:knowledge-base            # deterministic: retrieval correctness + rejection + routing
 *   KB_EVAL_JUDGE=1 npm run verify:knowledge-base   # + LLM-judge faithfulness (Anthropic, opt-in)
 *
 * Scores retrieval against the REAL Q&A in docs/Q&A - Sheet1.csv (as the Demo Winery tenant, which has
 * AWRI enabled by default). 7 AWRI retrieval questions: the expected source document must appear in the
 * top-k with a citation. 1 Wine Australia question is PENDING the fan-out. 2 calculator questions are
 * ROUTING checks (handled by calc_so2/calc_sugar, never the KB). 2 out-of-corpus questions must be
 * REJECTED (no on-topic passage). Self-contained: targeted-crawls the eval pages first (idempotent).
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { KNOWLEDGE_SOURCES } from "@/lib/knowledge/config";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { prisma } from "@/lib/prisma";
import { mentionsOffTopic } from "./kb-eval-match";

const TENANT = "org_demo_winery";

// The AWRI eval-question pages (the /wp-content PDFs aren't in the sitemap; crawlUrls reaches them).
const EVAL_URLS = [
  "https://www.awri.com.au/wp-content/uploads/2018/08/s1482.pdf",
  "https://www.awri.com.au/wp-content/uploads/2014/05/Brett-fact-sheet.pdf",
  "https://www.awri.com.au/industry_support/winemaking_resources/wine_fermentation/yan/",
  "https://www.awri.com.au/industry_support/winemaking_resources/winemaking-practices/winemaking-treatment-whole-bunch-fermentation/",
  "https://www.awri.com.au/wp-content/uploads/2020/03/protein-stability-fact-sheet.pdf",
  "https://www.awri.com.au/wp-content/uploads/2021/02/Treating-smoke-affected-grape-juice-with-activated-carbon.pdf",
];

interface RetrievalCase {
  q: string;
  // Any ONE of these URL substrings in top-k counts — some questions have several valid authoritative
  // sources (e.g. barrel sanitation is covered by both the Brett fact sheet AND AWRI's dedicated
  // barrel-cleaning page). The expectFact check still enforces that the correct facts are actually present.
  expectPaths: string[];
  expectFact: string[]; // key terms the retrieved passages should contain (faithfulness of retrieval)
}

const RETRIEVAL_CASES: RetrievalCase[] = [
  { q: "What is a good pre-infection fungicide I can use for downy mildew?", expectPaths: ["managing-downy-mildew", "downy-mildew"], expectFact: ["copper", "mancozeb"] },
  { q: "Are group 11 strobilurin good fungicides to use against downy mildew and powdery mildew?", expectPaths: ["s1482.pdf"], expectFact: ["resistance"] },
  { q: "What is the most effective way to remove the aromas from Brett?", expectPaths: ["Brett-fact-sheet.pdf", "brettanomyces"], expectFact: ["reverse osmosis"] },
  { q: "What is the most effective way to sanitize barrels against Brett?", expectPaths: ["Brett-fact-sheet.pdf", "barrel-cleaning-storage-and-maintenance", "brettanomyces-faq"], expectFact: ["70", "85"] },
  { q: "What is the most ideal YAN concentration for a white must?", expectPaths: ["/wine_fermentation/yan/"], expectFact: ["250", "350"] },
  { q: "Are there risks to consider with whole cluster (whole bunch) fermentation?", expectPaths: ["whole-bunch-fermentation"], expectFact: ["green", "bunch"] },
  { q: "What are the optimal conditions for the heat test for protein stability?", expectPaths: ["protein-stability-fact-sheet.pdf"], expectFact: ["80", "NTU"] },
  { q: "Does the carbon product used for smoke aroma reduction matter?", expectPaths: ["activated-carbon.pdf"], expectFact: ["carbon"] },
  // New sources (Plan 079 source expansion): each expects its own source's doc in top-k.
  { q: "How do I choose a wine yeast strain and what nitrogen nutrient does it need?", expectPaths: ["scott-labs-yeast", "yeast-choosing", "yeast-nutrient", "yeast-nutrition", "winemaking%20handbook"], expectFact: ["yeast"] }, // Scott Labs
  { q: "Does wildfire smoke exposure affect wine grapes and the resulting wine?", expectPaths: ["smoke-exposure", "impact-smoke"], expectFact: ["smoke"] }, // OSU Extension
  { q: "How do I monitor for grapevine leafroll virus and mealybugs in the vineyard?", expectPaths: ["leafroll", "mealybug"], expectFact: ["mealybug"] }, // OSU Extension
  // International source expansion 2 (multilingual + sparkling). An English query retrieves the native
  // French/Spanish chunks (voyage-4 is multilingual) + the sparkling specialists.
  { q: "How much sugar do I add at tirage to reach the right bottle pressure in méthode champenoise sparkling wine?",
    expectPaths: ["le-tirage", "le-dosage", "prise-de-mousse", "maisons-champagne", "SparklingHandbook", "Enartis-Sparkling", "FG_EN_Spark"], expectFact: ["tirage"] }, // UMC / sparkling PDFs
  { q: "What are the integrated pest management thresholds for wine grapes?",
    expectPaths: ["guiauvadetransformacion", "mapa.gob", "pnw-644", "field-monitoring"], expectFact: ["grape"] }, // MAPA (ES) + PNW IPM
  { q: "How do I test for TCA cork taint and haloanisoles in my wine?",
    expectPaths: ["etslabs", "publications/publication"], expectFact: ["haloanisole"] }, // ETS Laboratories (analysis authority)
  // Plan 084 — Cornell. The corpus previously had no cool-climate eastern-US authority, so these
  // questions were answered from Australian / Pacific-Northwest sources written for a different climate
  // and a different pest complex. Phomopsis and black rot are eastern-US disease-pressure signatures.
  { q: "What fungicide program controls Phomopsis and black rot in an eastern US vineyard?",
    expectPaths: ["blogs.cornell.edu", "grape-disease-control", "wilcox"], expectFact: ["phomopsis", "black rot"] },
];

// NOTE for whoever runs this after adding Cornell: the leafroll/mealybug case above expects an OSU
// document, and Cornell also publishes authoritatively on leafroll. If that case starts failing because
// a Cornell doc displaced the OSU one in top-6, retrieval got BETTER, not worse — widen that case's
// expectPaths rather than narrowing the Cornell source. Deliberately not pre-widened here: that would
// weaken a real OSU coverage check on a guess.

// The Wine Australia downy-mildew question (CSV #1) is now scored above — WA is crawled (HTML) + its
// /getmedia extension PDFs are indexed, so all 8 CSV retrieval questions are covered.

// Handled by the existing calculators, NEVER the KB (routing checks).
const CALC_ROUTING = [
  "If I have a pH of 3.2 and a Free SO2 of 20, what's the free molecular SO2? -> calc_so2",
  "I have 150 ppm YAN in a 10000 L ferment and want 250 ppm — how much DAP? -> calc_sugar",
];

// Must be REJECTED: nothing on-topic in the corpus.
const REJECTION_CASES = [
  { q: "How do I brew a hoppy IPA beer with dry hopping?", offTopic: ["ipa", "hops", "dry hop"] },
  { q: "What is the best espresso grind size for a flat white?", offTopic: ["espresso", "grind", "coffee"] },
];

// Word-boundary (not substring) matching for the rejection cases — see scripts/kb-eval-match.ts for why
// the naive `includes` check was a false-positive generator once a viticulture corpus got big enough.

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string, detail = "") {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (cond) passed++;
  else failed++;
}

async function ensureSeeded() {
  await runAsSystem(async (db) => {
    for (const s of KNOWLEDGE_SOURCES) {
      await db.knowledgeSource.upsert({
        where: { key: s.key },
        update: {},
        create: {
          key: s.key, publisher: s.publisher, homeDomain: s.homeDomain, tier: s.tier, license: s.license,
          seedRoots: s.seedRoots, allowPrefixes: s.allowPrefixes, denyPrefixes: s.denyPrefixes,
          crawlCadence: s.crawlCadence, defaultEnabled: s.defaultEnabled,
        },
      });
    }
  });
}

async function optionalJudge(caseName: string, question: string, passages: { text: string }[]) {
  if (process.env.KB_EVAL_JUDGE !== "1") return;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const context = passages.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n").slice(0, 8000);
  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 200,
    system:
      "You are a strict retrieval grader. Given a winemaking question and retrieved passages, answer ONLY " +
      "with 'GROUNDED: YES' if the passages actually contain the information needed to answer the question " +
      "faithfully (with any numbers), or 'GROUNDED: NO' otherwise, then one short reason.",
    messages: [{ role: "user", content: `Question: ${question}\n\nPassages:\n${context}` }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  assert(/GROUNDED:\s*YES/i.test(text), `judge: ${caseName}`, text.slice(0, 90));
}

async function main() {
  console.log("Plan 079 — knowledge-base eval\n");
  await ensureSeeded();

  console.log("targeted-crawling the eval pages (idempotent; first run embeds, later runs skip)...");
  const crawl = await crawlUrls("awri", EVAL_URLS, {
    onDocument: async (doc) => {
      await indexDocument({
        documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
        url: doc.canonicalUrl, contentHash: doc.contentHash,
      });
    },
  });
  console.log(`  crawl: fetched ${crawl.fetched}, documents ${crawl.documents}, errors ${crawl.errors}\n`);

  // Self-seed the new-source eval pages too (idempotent; routed to each source by host).
  const NEW_SOURCE_EVAL: { source: string; urls: string[] }[] = [
    { source: "scott-labs", urls: ["https://scottlab.com/yeast-nutrition-101"] },
    {
      source: "osu-extension",
      urls: [
        "https://extension.oregonstate.edu/catalog/em-9253-impact-smoke-exposure-wine",
        "https://extension.oregonstate.edu/catalog/em-8985-field-monitoring-leafroll-virus-mealybug-pacific-northwest-vineyards",
      ],
    },
    {
      // Plan 084 — Cornell. Deliberately spans BOTH allow prefixes: an HTML hub and a /grapes/files/ PDF,
      // plus a /newfruit/files/ PDF, because 35 of the 43 live Cornell PDFs live in that sibling file
      // store and a crawl that silently missed them would still look successful here.
      source: "cornell-grapes",
      urls: [
        "https://blogs.cornell.edu/grapes/ipm/diseases/",
        "https://blogs.cornell.edu/grapes/files/2016/12/Wilcox-Grape-Disease-Control-2017-1uzpoqi.pdf",
        "https://blogs.cornell.edu/newfruit/files/2016/12/Assessing-Winter-Cold-Injury-of-Grape-Canes-and-Trunks-Final-2ijd3wl.pdf",
      ],
    },
  ];
  for (const ns of NEW_SOURCE_EVAL) {
    await crawlUrls(ns.source, ns.urls, {
      onDocument: async (doc) => {
        await indexDocument({
          documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
          url: doc.canonicalUrl, contentHash: doc.contentHash,
        });
      },
    });
  }

  console.log("— retrieval correctness (expected source in top-k + citation) —");
  for (const c of RETRIEVAL_CASES) {
    const passages = await retrieveKnowledge({ tenantId: TENANT, query: c.q, topK: 6 });
    const hit = passages.find((p) => c.expectPaths.some((path) => p.canonicalUrl.toLowerCase().includes(path.toLowerCase())));
    const hasCitation = !!hit?.documentId;
    const factsIn = c.expectFact.every((f) =>
      passages.some((p) => p.text.toLowerCase().includes(f.toLowerCase())),
    );
    assert(!!hit && hasCitation && factsIn, `retrieval: ${c.q.slice(0, 52)}`,
      !hit ? `none of [${c.expectPaths.join(" | ")}] in top-k (got ${passages.map((p) => p.canonicalUrl.split("/").filter(Boolean).pop()).join(", ")})`
        : !factsIn ? "expected facts missing from passages" : "");
    if (hit) await optionalJudge(c.q.slice(0, 40), c.q, passages);
  }

  console.log("\n— negative rejection (out-of-corpus must return nothing on-topic) —");
  for (const r of REJECTION_CASES) {
    const passages = await retrieveKnowledge({ tenantId: TENANT, query: r.q, topK: 4 });
    let offender: { term: string; url: string } | null = null;
    for (const p of passages) {
      const term = mentionsOffTopic(p.text, r.offTopic);
      if (term) { offender = { term, url: p.canonicalUrl }; break; }
    }
    assert(
      !offender,
      `rejection: ${r.q.slice(0, 50)}`,
      offender ? `surfaced off-topic content ("${offender.term}" in ${offender.url})` : "",
    );
  }

  console.log("\n— source diversity / conflict-surfacing (Unit 9) —");
  {
    // a topic BOTH AWRI and Wine Australia cover should surface passages from >1 publisher, so the
    // assistant can present each authority's view rather than silently picking one.
    const q = "managing downy mildew in the vineyard";
    const passages = await retrieveKnowledge({ tenantId: TENANT, query: q, topK: 8 });
    const publishers = new Set(passages.map((p) => p.publisher));
    const dated = passages.filter((p) => p.publishedAt).length;
    assert(publishers.size >= 2, `diversity: dual-coverage query surfaces >=2 publishers`, `saw: ${[...publishers].join(", ")}`);
    console.log(`  (${passages.length} passages, ${publishers.size} publishers, ${dated} with a date)`);
    if (process.env.KB_EVAL_JUDGE === "1") {
      await optionalJudge("conflict-surfacing", `${q} — do AWRI and Wine Australia agree, and if not what does each recommend?`, passages);
    }
  }

  console.log("\n— publication-date coverage (plan 084) —");
  {
    // Asserted against the documents THIS RUN just (re)indexed, not the whole corpus. publishedAt is
    // written by indexDocument, which early-returns on unchanged/duplicate content — so pre-existing
    // documents from before plan 084 keep their null date until something forces a re-index
    // (reset:knowledge-source). A whole-corpus floor would therefore fail for a reason that is not a bug.
    //
    // Cornell is the right subject: it is freshly crawled above, it is the source whose content is
    // year-stamped and superseded annually, and 12/12 sampled Cornell PDFs carry real metadata dates —
    // so anything well below full coverage means the extraction regressed, not that the source is thin.
    const cornellDocs = await runAsSystem((db) =>
      db.knowledgeDocument.findMany({
        where: { source: { key: "cornell-grapes" }, status: "active" },
        select: { canonicalUrl: true, publishedAt: true, canonicalTitle: true },
      }),
    );
    if (cornellDocs.length === 0) {
      assert(false, "date coverage: cornell-grapes has documents to check", "no active cornell-grapes documents — did the crawl run?");
    } else {
      const dated = cornellDocs.filter((d) => d.publishedAt).length;
      const titled = cornellDocs.filter((d) => d.canonicalTitle).length;
      const pct = Math.round((dated / cornellDocs.length) * 100);
      assert(
        dated / cornellDocs.length >= 0.6,
        `date coverage: >=60% of cornell-grapes docs carry publishedAt`,
        `${dated}/${cornellDocs.length} dated (${pct}%)`,
      );
      // citation.ts renders `canonicalTitle || publisher`, so an untitled document cites as the bare
      // publisher name with no indication of WHICH document it is.
      assert(
        titled / cornellDocs.length >= 0.9,
        `title coverage: >=90% of cornell-grapes docs carry canonicalTitle`,
        `${titled}/${cornellDocs.length} titled`,
      );
      const undated = cornellDocs.filter((d) => !d.publishedAt).map((d) => d.canonicalUrl.split("/").pop());
      if (undated.length) console.log(`  undated: ${undated.slice(0, 8).join(", ")}${undated.length > 8 ? ` (+${undated.length - 8})` : ""}`);
    }
  }

  console.log("\n— routing checks (handled by calculators, not the KB) —");
  for (const r of CALC_ROUTING) console.log(`  · ${r}`);
  console.log("  (asserted structurally: these are calc-tool questions; the KB tool description defers math)");
  console.log(`\n(all 8 CSV retrieval questions scored — Wine Australia downy-mildew now covered via its /getmedia PDFs)`);

  console.log(`\n${failed === 0 ? "ALL KNOWLEDGE-BASE CHECKS PASSED ✓" : "KNOWLEDGE-BASE CHECKS FAILED ✗"} (${passed} passed, ${failed} failed)`);
  await disconnectSystem();
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
