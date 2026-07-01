import { getCurrentUser } from "@/lib/dal";

// Keyless address type-ahead for the compliance filer address. Proxies Photon (Komoot's
// OpenStreetMap geocoder) server-side so we can set a proper User-Agent and dodge CORS. Purely
// assistive — the client always keeps whatever the user typed if they ignore the suggestions.
export const runtime = "nodejs";

type PhotonFeature = {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
  };
};

export type AddressSuggestion = {
  label: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

function toSuggestion(f: PhotonFeature): AddressSuggestion | null {
  const p = f.properties ?? {};
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ").trim();
  // A named place (business/POI) with no street becomes street1 so nothing useful is dropped.
  const street1 = streetLine || (p.name ?? "");
  const city = p.city || p.town || p.village || p.locality || p.district || p.county || "";
  const state = p.state ?? "";
  const zip = p.postcode ?? "";
  if (!street1 && !city) return null;
  const label = [street1, city, [state, zip].filter(Boolean).join(" "), p.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return { label, street1, street2: "", city, state, zip };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ suggestions: [] });

  const upstream = new URL("https://photon.komoot.io/api");
  upstream.searchParams.set("q", q);
  upstream.searchParams.set("limit", "6");
  upstream.searchParams.set("lang", "en");

  try {
    const res = await fetch(upstream, {
      headers: { "User-Agent": "wine-inventory/1.0 (compliance address lookup)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return Response.json({ suggestions: [] });
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const suggestions = (data.features ?? [])
      .map(toSuggestion)
      .filter((s): s is AddressSuggestion => s != null && s.label.length > 0)
      .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
      .slice(0, 6);
    return Response.json({ suggestions });
  } catch {
    // Network/timeout — degrade silently to "just accept what you typed".
    return Response.json({ suggestions: [] });
  }
}
