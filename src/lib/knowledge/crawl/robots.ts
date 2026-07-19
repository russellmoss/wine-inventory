// Plan 079 — robots.txt compliance. Per-origin cache; honors Disallow + Crawl-delay for our UA. Fetches
// robots.txt through the SSRF-safe fetcher. A missing/unfetchable robots.txt is treated as permissive
// (standard behavior), but the source config's denyPrefixes are an independent, always-on hard block.

import robotsParser from "robots-parser";
import { fetchDocument } from "./fetcher";

const UA = "CellarhandKnowledgeBot";
const cache = new Map<string, ReturnType<typeof robotsParser>>();

async function getRobots(origin: string, isAllowedHost: (h: string) => boolean) {
  const cached = cache.get(origin);
  if (cached) return cached;
  const robotsUrl = `${origin}/robots.txt`;
  let text = "";
  try {
    const res = await fetchDocument(robotsUrl, { isAllowedHost });
    if (!res.notModified) text = res.bytes.toString("utf8");
  } catch {
    text = ""; // no robots.txt or fetch error -> permissive
  }
  const robots = robotsParser(robotsUrl, text);
  cache.set(origin, robots);
  return robots;
}

/** True if robots.txt allows our UA to fetch `url` (undefined/no-rule => allowed). */
export async function isAllowedByRobots(url: string, isAllowedHost: (h: string) => boolean): Promise<boolean> {
  const u = new URL(url);
  const robots = await getRobots(u.origin, isAllowedHost);
  return robots.isAllowed(url, UA) !== false;
}

/** Crawl-delay for our UA in milliseconds (0 if none). */
export async function getCrawlDelayMs(origin: string, isAllowedHost: (h: string) => boolean): Promise<number> {
  const robots = await getRobots(origin, isAllowedHost);
  const d = robots.getCrawlDelay(UA);
  return typeof d === "number" && d > 0 ? d * 1000 : 0;
}

/** Test seam: reset the per-origin cache. */
export function _resetRobotsCache(): void {
  cache.clear();
}
