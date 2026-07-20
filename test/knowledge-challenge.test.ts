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
import { detectChallengePage } from "@/lib/knowledge/crawl/challenge";

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

  it("never flags a PDF, even if the bytes coincidentally contain a marker word", () => {
    const pdf = Buffer.concat([buf("%PDF-1.7\n"), buf("Request unsuccessful. Incapsula incident ID: 1")]);
    expect(detectChallengePage(pdf, "application/pdf")).toBeNull();
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
