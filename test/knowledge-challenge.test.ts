// Plan 085 — WAF / bot-wall challenge detection.
//
// WHY THIS SUITE EXISTS: a challenge page arrives with HTTP **200** and `content-type: text/html`,
// so nothing in the fetch path refuses it. It classifies as "html" (classifyContentType's header
// arm wins), gets persisted, extracted, chunked and EMBEDDED. Worse, Imperva stamps a unique
// `incident_id` into every challenge, so the content-hash dedup never fires and the garbage
// re-embeds on every monthly sweep, forever.
//
// The detector is a pure function precisely so it can be tested here: `fetchDocument` itself is
// effectively untestable (readCapped needs a real ReadableStream, assertPublicHost does live DNS).

import { describe, it, expect } from "vitest";
import { detectChallengePage, findDarkSources } from "@/lib/knowledge/crawl/challenge";

const HTML = "text/html; charset=utf-8";

/**
 * The REAL Imperva/Incapsula body served by www.canr.msu.edu during plan-085 reconnaissance
 * (HTTP 200, 965 bytes). Kept verbatim — a paraphrase would not prove we match what ships.
 */
const INCAPSULA_BODY =
  '<html style="height:100%"><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW">' +
  '<meta name="format-detection" content="telephone=no"><meta name="viewport" content="initial-scale=1.0">' +
  '<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">' +
  '<script type="text/javascript" src="/_Incapsula_Resource?SWJIYLWA=719d34d31c8e3a6e6fffd425f7e032f3"></script>' +
  '</head><body style="margin:0px;height:100%"><iframe id="main-iframe" src="/_Incapsula_Resource?SWUDNSAI=31&xinfo=10-4545981-0" ' +
  'frameborder=0 width="100%" height="100%" marginheight="0px" marginwidth="0px">' +
  "Request unsuccessful. Incapsula incident ID: 5031000680090292385-27230234720276746</iframe></body></html>";

const CLOUDFLARE_BODY =
  "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>" +
  '<div class="cf-browser-verification cf-im-under-attack">' +
  "<h1>Checking your browser before accessing example.com</h1></div></body></html>";

/** A real MSU article body, trimmed. The point is that it contains no challenge markers. */
const REAL_ARTICLE =
  "<!DOCTYPE html><html><head><title>Cold hardiness of grapevines - Grapes</title>" +
  '<script type="application/ld+json">{"datePublished":"2024-4-11EDT12:00AM"}</script></head><body>' +
  "<article><h1>Cold hardiness of grapevines</h1><p>Grapevine cold hardiness is a critical factor " +
  "in viticulture, especially in regions like Michigan that experience severe winter temperatures. " +
  "Acclimation begins in late summer and deepens through autumn.</p></article></body></html>";

const buf = (s: string) => Buffer.from(s, "utf8");

describe("detectChallengePage", () => {
  it("detects the real Incapsula challenge served by canr.msu.edu", () => {
    const got = detectChallengePage(buf(INCAPSULA_BODY), HTML);
    expect(got).not.toBeNull();
    expect(got?.vendor).toBe("imperva");
  });

  it("detects a Cloudflare interstitial", () => {
    const got = detectChallengePage(buf(CLOUDFLARE_BODY), HTML);
    expect(got).not.toBeNull();
    expect(got?.vendor).toBe("cloudflare");
  });

  it("reports the matched marker and body size for the run log", () => {
    const got = detectChallengePage(buf(INCAPSULA_BODY), HTML);
    expect(got?.marker).toBeTruthy();
    expect(got?.byteSize).toBe(buf(INCAPSULA_BODY).length);
  });

  it("passes a real MSU article through untouched", () => {
    expect(detectChallengePage(buf(REAL_ARTICLE), HTML)).toBeNull();
  });

  // The load-bearing negative. A body-size threshold is the tempting implementation and it is
  // WRONG: short legitimate pages exist (stubs, redirect shims, thin index pages). If someone
  // later adds a size heuristic, this test fails and tells them why.
  it("does NOT flag a short but legitimate page (no size heuristic)", () => {
    const short = "<html><head><title>Rootstocks</title></head><body><p>See the rootstock table.</p></body></html>";
    expect(buf(short).length).toBeLessThan(2048);
    expect(detectChallengePage(buf(short), HTML)).toBeNull();
  });

  // isPdf has two arms and each needs its own case — one test passing BOTH a %PDF- prefix and
  // "application/pdf" would still pass with either arm deleted.
  it("never flags a PDF identified by its content-type header", () => {
    expect(detectChallengePage(buf("Incapsula incident ID: 1"), "application/pdf")).toBeNull();
  });

  it("never flags a PDF identified by magic bytes when the header lies", () => {
    // The arm that matters: a PDF served as text/html. Binary payloads can contain anything.
    const pdf = Buffer.concat([buf("%PDF-1.7\n"), buf("Incapsula incident ID: 1")]);
    expect(detectChallengePage(pdf, HTML)).toBeNull();
  });

  // A typo in any of these ships silently — they are the least-observed vendors, so nobody catches
  // it by hand.
  it.each([
    ["akamai", "<html><head><TITLE>Access Denied</TITLE></head><body>ref</body></html>"],
    ["datadome", '<html><head><script src="https://js.datadome.co/tags.js"></script></head></html>'],
    ["perimeterx", '<html><body><div id="px-captcha"></div></body></html>'],
  ])("detects a %s interstitial", (vendor, body) => {
    expect(detectChallengePage(buf(body), HTML)?.vendor).toBe(vendor);
  });

  // Deliberately NOT a marker: generic English, redundant with _Incapsula_Resource, and real
  // false-positive surface across 21 sources since we scan 64KB of every body.
  it("does NOT flag a page merely containing the phrase 'Request unsuccessful.'", () => {
    const body = "<html><body><p>Request unsuccessful. Retry the veraison sampling next week.</p></body></html>";
    expect(detectChallengePage(buf(body), HTML)).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(detectChallengePage(Buffer.alloc(0), HTML)).toBeNull();
  });

  it("still inspects a body whose content-type header is missing", () => {
    // Some WAFs omit content-type on the interstitial. An unknown type must not buy a free pass.
    expect(detectChallengePage(buf(INCAPSULA_BODY), "")).not.toBeNull();
  });

  it("does not scan unboundedly — a marker past the scan window is not matched", () => {
    const padded = "x".repeat(80_000) + "Request unsuccessful. Incapsula incident ID: 9";
    expect(detectChallengePage(buf(padded), HTML)).toBeNull();
  });
});

describe("findDarkSources (monthly-job failure predicate)", () => {
  it("flags a source that was challenged and indexed nothing", () => {
    expect(findDarkSources({ "msu-grapes": { documents: 0, notModified: 0, skippedChallenge: 12 } })).toEqual(["msu-grapes"]);
  });

  // The whole reason the predicate is not `skippedChallenge > 0`. Challenges are intermittent --
  // during recon one path was refused while its siblings on the same host were served, minutes
  // apart. Failing on ANY challenge would red the monthly job routinely and train everyone to
  // ignore it, which is worse than not alerting at all.
  it("does NOT flag a source that was challenged but still brought back documents", () => {
    expect(findDarkSources({ "msu-grapes": { documents: 40, notModified: 0, skippedChallenge: 3 } })).toEqual([]);
  });

  it("does NOT flag a source with zero documents and no challenge (nothing new to fetch)", () => {
    expect(findDarkSources({ awri: { documents: 0, notModified: 0, skippedChallenge: 0 } })).toEqual([]);
  });

  it("reports every dark source, sorted, so the failure message is stable", () => {
    expect(
      findDarkSources({
        wsu: { documents: 0, notModified: 0, skippedChallenge: 1 },
        awri: { documents: 5, notModified: 0, skippedChallenge: 0 },
        "msu-grapes": { documents: 0, notModified: 0, skippedChallenge: 9 },
      }),
    ).toEqual(["msu-grapes", "wsu"]);
  });

  it("is empty for a clean run", () => {
    expect(findDarkSources({ awri: { documents: 12, notModified: 0, skippedChallenge: 0 } })).toEqual([]);
  });

  // THE REGRESSION THIS PREDICATE ALMOST SHIPPED WITH. `documents` counts only pages we re-indexed;
  // the whole point of the conditional-GET re-crawl is that unchanged pages come back 304 and
  // increment notModified instead. So a healthy source on a stable corpus legitimately ends a month
  // with documents === 0. One intermittent challenge would then have declared it "dark" and failed
  // the monthly job for all 21 sources -- and the odds rise every month as the 304 rate approaches
  // 100%. A 304 is positive proof the ORIGIN answered, not the bot wall.
  it("does NOT flag a fully-cached source that 304'd everything and saw one challenge", () => {
    expect(findDarkSources({ awri: { documents: 0, notModified: 40, skippedChallenge: 1 } })).toEqual([]);
  });

  it("still flags a source with no documents AND no 304s", () => {
    expect(findDarkSources({ awri: { documents: 0, notModified: 0, skippedChallenge: 7 } })).toEqual(["awri"]);
  });
});
