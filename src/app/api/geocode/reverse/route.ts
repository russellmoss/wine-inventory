import { getCurrentUser } from "@/lib/dal";

// Spray S2b Unit 1 — reverse-geocode a GPS pin into a country/state PROPOSAL for the vineyard
// jurisdiction field. Same keyless Photon (Komoot) host as ../route.ts, same reasoning: no API key,
// no Google Maps dependency, already trusted in this repo. Purely assistive — the vineyard settings
// form always requires an explicit human confirm before a proposal becomes the stored jurisdiction
// (rule §3.2 / council S6). A network failure or a miss degrades to "nothing proposed", never a guess.
export const runtime = "nodejs";

type PhotonReverseFeature = {
  properties?: {
    countrycode?: string;
    state?: string;
  };
};

export type JurisdictionProposal = { country: string; state: string | null } | null;

// A fixed, deterministic dictionary — not inference. Photon returns a US state's full name
// ("California"); this is an exact lookup into a static table, not a fuzzy match, so it never
// fabricates a code the way a similarity match could.
const US_STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return Response.json({ proposal: null });
  }

  const upstream = new URL("https://photon.komoot.io/reverse");
  upstream.searchParams.set("lat", String(lat));
  upstream.searchParams.set("lon", String(lng));

  try {
    const res = await fetch(upstream, {
      headers: { "User-Agent": "wine-inventory/1.0 (vineyard jurisdiction proposal)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return Response.json({ proposal: null });
    const data = (await res.json()) as { features?: PhotonReverseFeature[] };
    const p = data.features?.[0]?.properties;
    const country = p?.countrycode?.toUpperCase().trim();
    if (!country || country.length !== 2) return Response.json({ proposal: null });
    // Photon's `state` is a full name ("California"). For the US, resolve it through the exact
    // dictionary above; outside the US (or an unrecognized name) the state stays null — the grower
    // types it. Either way this is a PROPOSAL: the form still requires an explicit confirm.
    const stateCode = country === "US" ? (US_STATE_CODES[(p?.state ?? "").trim().toLowerCase()] ?? null) : null;
    const proposal: JurisdictionProposal = { country, state: stateCode };
    return Response.json({ proposal });
  } catch {
    return Response.json({ proposal: null });
  }
}
