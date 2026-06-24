"use client";

// Esri World Imagery "Wayback" — a free, keyless archive of dated snapshots of
// the World Imagery basemap (≈190 releases back to 2014). We use it for the map's
// opt-in "History" mode: Google stays the default current basemap, and Wayback
// lets the user scrub through past imagery vintages.
//
// Caveat: resolution is Esri's, and Wayback only re-publishes where imagery
// actually changed — so for sparsely-flown regions many dates look identical.

const WAYBACK_CONFIG_URL =
  "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";

export type WaybackRelease = {
  releaseNum: number;
  /** ISO date string, e.g. "2026-05-28". */
  date: string;
  /** Leaflet tile URL template ({z}/{y}/{x}) for this release. */
  tileUrl: string;
};

type WaybackConfigEntry = { itemTitle?: string; itemURL?: string };

let memo: WaybackRelease[] | null = null;

/**
 * Load + cache the Wayback release list, sorted oldest → newest. Throws on a
 * network/parse failure so the caller can surface an error and stay on Google.
 */
export async function loadWaybackReleases(): Promise<WaybackRelease[]> {
  if (memo) return memo;

  const res = await fetch(WAYBACK_CONFIG_URL);
  if (!res.ok) throw new Error(`Wayback config failed (${res.status})`);
  const cfg = (await res.json()) as Record<string, WaybackConfigEntry>;

  const out: WaybackRelease[] = [];
  for (const [num, entry] of Object.entries(cfg)) {
    if (!entry?.itemURL) continue;
    const date = entry.itemTitle?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    if (!date) continue;
    const tileUrl = entry.itemURL
      .replace("{level}", "{z}")
      .replace("{row}", "{y}")
      .replace("{col}", "{x}");
    out.push({ releaseNum: Number(num), date, tileUrl });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  memo = out;
  return out;
}
