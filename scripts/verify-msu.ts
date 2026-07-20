/**
 * Plan 085 — prove the MSU Extension source end to end, WITHOUT the database.
 *
 *   npm run verify:msu
 *
 * Deliberately DB-free so it runs anywhere (no .env, no Neon) — it proves the FEATURE, the way
 * verify:vt-enology does. Two halves, and the split matters:
 *
 *   PURE   — asserted against the SHIPPED config (not a synthetic fixture, which is what the unit
 *            tests use). Always runs, even when the network is blocked.
 *   LIVE   — fetches a small sample and checks the rule against MSU's REAL page structure. Unit
 *            tests cannot do this: they can only prove the rule is self-consistent, not that
 *            /grapes/ actually links to /news/ articles the way we assumed.
 *
 * WHY THIS EXISTS AT ALL: both MSU failure modes are invisible to a "successful" crawl. A WAF
 * challenge ingests as a valid HTML document (it is 200 + text/html), and a provenance rule that
 * silently stops admitting /news/ shows up in CrawlSummary as nothing whatsoever. Neither is
 * catchable by the unit tests, which never touch the network, or by the crawl loops, which have no
 * coverage at all.
 *
 * NOTE this uses bare `fetch`, like verify-vt-enology — so it bypasses the allowlist/SSRF/robots
 * stack AND fetchDocument's challenge wiring. It therefore calls detectChallengePage on the bytes
 * itself; otherwise a WAF block would masquerade as a content mismatch.
 */
import { findSourceConfig, TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { decideAdmission, pathAllowedAsLinkOnly } from "@/lib/knowledge/crawl/crawler";
import { extractLinks } from "@/lib/knowledge/crawl/link-gate";
import { detectChallengePage } from "@/lib/knowledge/crawl/challenge";
import { extractHtml } from "@/lib/knowledge/extract/html";
import { resolvePublishedDate } from "@/lib/knowledge/extract/published-date";

const UA = "CellarhandKnowledgeBot (+plan-085 verify)";
const DELAY_MS = 2000; // MSU escalates its bot wall with request volume — stay well under the radar
const HUB = "https://www.canr.msu.edu/grapes/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kept separate because the report has to tell an operator WHICH half broke: a pure failure is a
// config regression in this repo, a live failure is MSU changing their site. One array reported as
// "pure checks" would point debugging at exactly the wrong place.
const pureFailures: string[] = [];
const liveFailures: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) pureFailures.push(msg);
};
const checkLive = (ok: boolean, msg: string) => {
  if (!ok) liveFailures.push(msg);
};

async function get(url: string): Promise<{ bytes: Buffer; challenged: string | null }> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  const bytes = Buffer.from(await res.arrayBuffer());
  // A bot wall has two shapes and only one of them is a 200 interstitial. Imperva escalates to
  // outright 403/429 (which is what MSU did after ~15 recon requests), and Cloudflare answers 503.
  // Without this, a non-2xx block falls through to the content assertions and reports a FEATURE
  // failure ("the hub linked NO admissible /news/ articles") — the exact confusion this script
  // exists to prevent.
  if (!res.ok) return { bytes, challenged: `HTTP ${res.status}` };
  const c = detectChallengePage(bytes, res.headers.get("content-type") ?? "");
  return { bytes, challenged: c ? `${c.vendor} (${c.byteSize}B)` : null };
}

async function main() {
  const cfg = findSourceConfig("msu-grapes");
  if (!cfg) throw new Error("msu-grapes is not in KNOWLEDGE_SOURCES — nothing to verify");

  // ---- PURE: the shipped config says what we think it says -------------------------------------
  check(cfg.autoCrawl !== false, "msu-grapes must stay on the monthly sweep (autoCrawl !== false)");
  check(cfg.crawlCadence === "monthly", "msu-grapes crawlCadence must be 'monthly'");
  check(TRUSTED_DOMAIN_SET.has("canr.msu.edu"), "canr.msu.edu missing from TRUSTED_DOMAINS");
  check(TRUSTED_DOMAIN_SET.has("www.canr.msu.edu"), "www.canr.msu.edu missing from TRUSTED_DOMAINS");
  check(
    JSON.stringify(cfg.linkedOnlyPrefixes) === JSON.stringify([{ prefix: "/news/", linkedFrom: ["/grapes/"] }]),
    "msu-grapes linkedOnlyPrefixes is not the expected /news/-from-/grapes/ rule",
  );

  // The admission rule, against the SHIPPED config. If someone widens allowPrefixes to include
  // /news/, the unit tests (which use a synthetic cfg) would still pass and the whole MSU Extension
  // corpus would start flowing in. This is the assertion that catches that.
  const NEWS = "https://www.canr.msu.edu/news/cold-hardiness-of-grapevines";
  check(
    decideAdmission(cfg, NEWS, HUB).admit === true,
    "a /news/ article linked from the /grapes/ hub must be ADMITTED",
  );
  check(
    decideAdmission(cfg, NEWS, "https://www.canr.msu.edu/news/dairy-margins").admit === false,
    "a /news/ article linked from another /news/ page must be REFUSED (one hop only)",
  );
  check(decideAdmission(cfg, NEWS, null).admit === false, "a /news/ article with no parent must be REFUSED");
  check(
    decideAdmission(cfg, "https://www.canr.msu.edu/dairy/feeding", HUB).admit === false,
    "non-grape Extension content must be REFUSED even from a /grapes/ parent",
  );
  const admitted = decideAdmission(cfg, NEWS, HUB);
  check(admitted.admit === true && admitted.terminal === true, "an admitted /news/ article must be TERMINAL");
  check(pathAllowedAsLinkOnly(cfg, NEWS + "/"), "a redirect onto another /news/ path must survive the re-gate");

  // ---- LIVE: does MSU's real hub actually feed the rule? ----------------------------------------
  let liveBlocked: string | null = null;
  let admittedNews: string[] = [];

  const hub = await get(HUB);
  if (hub.challenged) {
    liveBlocked = `hub ${HUB} -> ${hub.challenged}`;
  } else {
    const links = extractLinks(hub.bytes.toString("utf8"), HUB);
    admittedNews = links.filter((l) => l.includes("/news/") && decideAdmission(cfg, l, HUB).admit);

    // The load-bearing live assertion. If MSU restructures the hub so it no longer links articles,
    // the crawl still "succeeds" and quietly ingests nothing but index pages.
    checkLive(
      admittedNews.length > 0,
      `the /grapes/ hub linked NO admissible /news/ articles (found ${links.length} links total) — ` +
        "the linkedOnly rule would ingest index pages only",
    );

    // Nothing outside the grape programme should be admissible from the hub.
    const leaked = links.filter((l) => {
      try {
        const p = new URL(l).pathname;
        return !p.startsWith("/grapes/") && !p.startsWith("/news/") && decideAdmission(cfg, l, HUB).admit;
      } catch {
        return false;
      }
    });
    checkLive(leaked.length === 0, `non-grape paths were admissible from the hub: ${leaked.slice(0, 5).join(", ")}`);
    // The leak check above cannot fail against the SHIPPED config (allowPrefixes is /grapes/ only),
    // so on its own it is vacuous. This is what gives it teeth: assert the hub genuinely still
    // serves cross-programme links, so "nothing leaked" means "we evaluated real hostile input and
    // it was refused" rather than "there was nothing to refuse".
    const crossProgramme = links.filter((l) => {
      try {
        const p = new URL(l).pathname;
        return !p.startsWith("/grapes/") && !p.startsWith("/news/");
      } catch {
        return false;
      }
    });
    checkLive(
      crossProgramme.length > 0,
      "the hub served no cross-programme links at all — the leak check above evaluated nothing, " +
        "so it is no longer evidence that the prefix rules hold",
    );

    // ---- LIVE: dates. The user's explicit requirement was knowing when guidance is old. ---------
    if (admittedNews.length) {
      await sleep(DELAY_MS);
      const art = await get(admittedNews[0]);
      if (art.challenged) {
        liveBlocked = `article ${admittedNews[0]} -> ${art.challenged}`;
      } else {
        const ex = await extractHtml(art.bytes.toString("utf8"), admittedNews[0]);
        const when = resolvePublishedDate({ metadataDate: ex.published, markdown: ex.markdown });
        checkLive(
          when !== null,
          `no publishedAt recovered from ${admittedNews[0]} (defuddle.published=${JSON.stringify(ex.published)}) — ` +
            "MSU passages would all carry the 'unknown' age warning",
        );
        checkLive(ex.wordCount > 100, `article extracted only ${ex.wordCount} words — extraction may be broken`);
        if (when) console.log(`  publishedAt recovered: ${when.toISOString().slice(0, 10)} from ${admittedNews[0]}`);
      }
    }
  }

  // ---- Report ----------------------------------------------------------------------------------
  console.log(`\nconfig checks: ${pureFailures.length ? `${pureFailures.length} FAILED` : "PASS"}`);
  console.log(
    `live checks:   ${liveBlocked ? "BLOCKED" : liveFailures.length ? `${liveFailures.length} FAILED` : "PASS"}`,
  );
  if (admittedNews.length) console.log(`  ${admittedNews.length} admissible /news/ articles from the hub`);

  if (pureFailures.length || liveFailures.length) {
    // Tagged by half: a [config] failure is a regression in this repo, a [live] failure means MSU
    // changed their site. Reporting both as "pure checks" pointed debugging at the wrong one.
    for (const f of pureFailures) console.error(`  ✗ [config] ${f}`);
    for (const f of liveFailures) console.error(`  ✗ [live]   ${f}`);
    process.exit(1);
  }
  if (liveBlocked) {
    // NOT a feature failure, and saying "PASS" here would be a lie — we verified nothing live.
    console.error(
      `\n✗ BLOCKED — MSU's bot wall answered instead of the origin: ${liveBlocked}\n` +
        "  This is a WAF block, not a broken feature: the config checks above all passed.\n" +
        "  MSU escalates with request volume; retry later, or from a different network.\n" +
        "  If the MONTHLY job reports msu-grapes in darkSources, that is the same thing from CI —\n" +
        "  see the fallback noted on the source entry in config.ts (autoCrawl:false + curated crawl).",
    );
    process.exit(1);
  }
  console.log("\n✓ PASS — MSU grape articles are reachable via /grapes/, admitted one hop only, and dated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
