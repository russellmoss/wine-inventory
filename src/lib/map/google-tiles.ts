"use client";

// Google Map Tiles API helpers (client-side). Unlike a plain XYZ basemap, Google
// 2D tiles need a *session token* created first; the token is then reused for
// every tile request. Google also requires showing the dynamic copyright string
// returned by the viewport endpoint.
//
// The API key is necessarily exposed to the browser (every tile request carries
// it), exactly like the Google Maps JS API. Protect it by restricting the key to
// the "Map Tiles API" and your app's HTTP referrers in Google Cloud Console.
//
// Session tokens last ~2 weeks; we cache one in localStorage and reuse it so we
// don't mint a new session on every map mount.

const SESSION_ENDPOINT = "https://tile.googleapis.com/v1/createSession";
const VIEWPORT_ENDPOINT = "https://tile.googleapis.com/tile/v1/viewport";

/** Tile URL template for Leaflet's L.tileLayer. Append `?session=&key=`. */
export const GOOGLE_2D_TILE_URL = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}";

export type GoogleMapType = "satellite" | "roadmap" | "terrain";

type SessionCache = {
  session: string;
  expiryMs: number;
  key: string;
  mapType: GoogleMapType;
};

const LS_KEY = "bw.googleMapSession.v1";
let memo: SessionCache | null = null;

function readCache(): SessionCache | null {
  if (memo) return memo;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SessionCache;
    return c && typeof c.session === "string" ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: SessionCache): void {
  memo = c;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    /* private mode / quota — in-memory memo still works for this session */
  }
}

/**
 * Get a (cached) Google Maps session token for the given map type. Throws if the
 * key is rejected (bad key / Map Tiles API not enabled / billing off) so callers
 * can fall back to another basemap.
 */
export async function getGoogleMapSession(
  apiKey: string,
  mapType: GoogleMapType = "satellite",
): Promise<string> {
  const cached = readCache();
  if (
    cached &&
    cached.key === apiKey &&
    cached.mapType === mapType &&
    cached.expiryMs - 60_000 > Date.now()
  ) {
    memo = cached;
    return cached.session;
  }

  const res = await fetch(`${SESSION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType, language: "en-US", region: "US" }),
  });
  if (!res.ok) {
    throw new Error(`Google Map session failed (${res.status})`);
  }
  const data = (await res.json()) as { session?: string; expiry?: string };
  if (!data.session) throw new Error("Google Map session: no token in response");

  const expirySecs = Number(data.expiry);
  const expiryMs = Number.isFinite(expirySecs)
    ? expirySecs * 1000
    : Date.now() + 12 * 24 * 3600 * 1000; // ~12d default, under Google's ~2w cap

  writeCache({ session: data.session, expiryMs, key: apiKey, mapType });
  return data.session;
}

/**
 * Fetch the required Google copyright string for the current viewport. Returns
 * an empty string on any failure (attribution just won't update — non-fatal).
 */
export async function getGoogleAttribution(
  apiKey: string,
  session: string,
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number,
): Promise<string> {
  try {
    const url = new URL(VIEWPORT_ENDPOINT);
    url.searchParams.set("session", session);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("zoom", String(Math.max(0, Math.round(zoom))));
    url.searchParams.set("north", String(bounds.north));
    url.searchParams.set("south", String(bounds.south));
    url.searchParams.set("east", String(bounds.east));
    url.searchParams.set("west", String(bounds.west));
    const res = await fetch(url.toString());
    if (!res.ok) return "";
    const data = (await res.json()) as { copyright?: string };
    return data.copyright ?? "";
  } catch {
    return "";
  }
}
