// Plan 079 — the curated trusted-source registry. This is the MOAT and the crawl boundary: the crawler
// only fetches sources listed here, and only follows links INTO domains in TRUSTED_DOMAINS. Adding a
// source later is a config edit (re-run scripts/seed-knowledge-sources.ts), not code. AWRI is source #1,
// Wine Australia #2 (queued: UC Davis, Oregon State, Washington State, Cornell).
//
// Plan 084 — "a config edit, not code" holds for MOST sources but is no longer universal. A source that
// mixes technical and non-technical content inside ONE url cannot be expressed with path prefixes, and
// needs a `sectionFilter` strategy implemented in src/lib/knowledge/sections/ (see vt-enology-notes).

export interface KnowledgeSourceConfig {
  key: string;
  publisher: string;
  homeDomain: string;
  tier: number; // 1 = peer-reviewed / official extension; 2 = industry/vendor (product-biased)
  license: string;
  seedRoots: string[];
  allowPrefixes: string[]; // path prefixes permitted (matched on URL pathname)
  denyPrefixes: string[]; // path prefixes refused (paywalled / robots-disallowed)
  // Explicit sitemap URL(s). The auto crawler otherwise only probes origin/sitemap_index.xml +
  // origin/sitemap.xml; set this when the sitemap lives elsewhere (e.g. WordPress core /wp-sitemap.xml).
  sitemapUrls?: string[];
  // false = NOT part of the automatic sitemap/link-following crawl or the weekly re-crawl loop; the
  // corpus is populated by a dedicated operator script instead (a curated URL list that path-prefix
  // filtering can't cleanly express, or a paginated listing walk). Default true.
  autoCrawl?: boolean;
  // Plan 084 — strip non-technical SECTIONS from within a page before extraction. Only needed when
  // a source mixes technical and non-technical content inside ONE url, which path-prefix filtering
  // structurally cannot express (VT Enology Notes puts rot chemistry and a paid tour ad on the same
  // page). "anchor-heading" = split on <a name="N"> anchors, classify by heading text. Config-only,
  // like sitemapUrls/autoCrawl — the seed script does not persist it, so no migration.
  sectionFilter?: "anchor-heading";
  // Plan 085 — paths admitted ONLY when discovered as a link FROM a page whose path matches one of
  // `linkedFrom`. Never seeded, and TERMINAL: links found on such a page are not followed onward.
  //
  // Why this exists: MSU Extension's substantive viticulture articles live at flat /news/<slug>
  // URLs, but /news/ is also every other MSU Extension programme (dairy, field crops, 4-H,
  // forestry). No `startsWith` prefix can separate them, and there is no sitemap to filter. What
  // DOES separate them is provenance: the grape articles are the ones the /grapes/ pages link to.
  //
  // Terminal-ness is the part that actually caps the blast radius. Those articles cross-link
  // heavily into unrelated Extension content, so following them even one hop would pull in the
  // corpus this rule exists to exclude. denyPrefixes still win first, as everywhere else.
  linkedOnlyPrefixes?: { prefix: string; linkedFrom: string[] }[];
  crawlCadence: string;
  defaultEnabled: boolean;
}

export const KNOWLEDGE_SOURCES: KnowledgeSourceConfig[] = [
  {
    key: "ives-technical-reviews",
    publisher: "IVES Technical Reviews",
    homeDomain: "ives-technicalreviews.eu",
    tier: 1, // International Viticulture and Enology Society; peer-reviewed research transferred to end users
    // THE ONLY SOURCE IN THIS REGISTRY WITH AN ACTUAL LICENCE GRANT. Every other entry rests on an
    // ABSENCE of objection (public extension content, fair use, no explicit permission). CC BY is
    // affirmative permission to reproduce and redistribute, INCLUDING commercially — so this source is
    // the one immune to the "does the posture change if Cellarhand is sold to wineries" question.
    // Verified 2026-07-22 on their own Open Access Policy page (/accessPolicy).
    //
    // ATTRIBUTION IS THE LICENCE CONDITION, not a courtesy. CC BY requires crediting the author plus a
    // link to the source. Citations carry publisher + canonicalUrl today; author-level attribution is a
    // known gap (KnowledgeDocument has no author field) and is tracked in TODOS.
    license:
      "Creative Commons Attribution (CC BY) — authors retain copyright and readers are explicitly free " +
      "to read, download, copy and disseminate the full text with mandatory reference to the authors and " +
      "original publication. https://ives-technicalreviews.eu/accessPolicy",
    // autoCrawl:false — there is NO sitemap (both probes 404) and /issue/archive server-renders zero
    // issue links, so sitemap discovery and link-following would between them reach only the current
    // issue's ~11 articles out of 200+. scripts/crawl-ives.ts enumerates the journal's OAI-PMH feed
    // instead, which is complete and machine-readable. Same pattern as ets/incavi.
    autoCrawl: false,
    seedRoots: ["https://ives-technicalreviews.eu/issue/current"],
    allowPrefixes: ["/article/"],
    // robots.txt disallows only /cache/ for generic agents (named blocks on SemrushBot, Bytedance,
    // Bytespider, Arquivo do not apply to this crawler). The rest are OJS application routes with no
    // technical content — cheap to refuse explicitly so a future link-follow can never wander in.
    denyPrefixes: ["/cache/", "/user/", "/login", "/submit", "/search", "/$$$call$$$", "/plugins/"],
    crawlCadence: "monthly",
    // Default-ON, and this is the MEASURED position rather than the hoped-for one. It was staged: shipped
    // false, crawled (209 documents / 3,316 chunks), enabled for the Demo Winery sandbox alone, then
    // measured with `npm run verify:kb-register` against the pre-IVES baseline captured before the source
    // existed. Result: **4 of 120 slots changed hands (3%)**, no question losing more than 2 of 6, and 17
    // of 20 practical questions completely unchanged. IVES took slots on oak ageing, oxidation at
    // pressing and Riesling acid targets — topics where a research review genuinely belongs. That is
    // integration, not crowding-out, so the gate's own verdict supports enabling it everywhere.
    defaultEnabled: true,
  },
  {
    key: "cornell-grapes",
    publisher: "Cornell Fruit Resources: Grapes",
    homeDomain: "blogs.cornell.edu",
    tier: 1,
    license:
      "Public Cornell Cooperative Extension grape resource (Cornell Fruit Resources) — store paraphrasable text + a link back.",
    // Cool-climate eastern-US IPM: the corpus otherwise has only Australian (AWRI, Wine Australia) and
    // Pacific-Northwest (WSU, OSU) authorities, and answers eastern disease-pressure questions from the
    // wrong climate and the wrong pest complex.
    //
    // SCOPING IS LOAD-BEARING HERE. blogs.cornell.edu is Cornell's ENTIRE university-wide WordPress
    // multisite (thousands of unrelated blogs), so unlike wsu — which owns its host and can allow "/" —
    // this source must stay anchored to specific path prefixes. A bare "/" allow would crawl the whole
    // university.
    //
    // Two prefixes, not one: 35 of the 43 live Cornell PDFs the grape site links to are stored under
    // /newfruit/files/ (the sibling Cornell Fruit Resources blog's file store), NOT /grapes/. They are
    // unambiguously grape documents — cold injury to canes and trunks, canopy management for hybrids,
    // vineyard site selection, organic vineyard pest management. Allowing ONLY the file store (never
    // /newfruit/ HTML) picks them up via link-following without dragging in the tree-fruit blog.
    // EVERY uploaded file redirects to a CDN ON A DIFFERENT HOST, and without the third prefix below
    // this source gets its HTML and NONE of its 43 PDFs. Measured: a crawl reported "29 documents,
    // 168 errors", and all 168 were `host bpb-us-e1.wpmucdn.com is not allowlisted`.
    //
    //   blogs.cornell.edu/newfruit/files/2017/01/Rootstocks-…pdf
    //     -> 302 -> bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/0/7265/files/2017/01/Rootstocks-…pdf
    //
    // Two things are required, because the host gate and the path gate are separate: the CDN host in
    // TRUSTED_DOMAINS (fetchDocument re-checks the HOST on every redirect hop), and a matching
    // allowPrefix (crawlWithFollowing re-gates the FINAL url's PATH after a redirect). Miss either and
    // the PDFs are still dropped — one as a throw, the other as skippedRedirect.
    //
    // SCOPING THE CDN MATTERS AS MUCH AS SCOPING THE BLOG. bpb-us-e1.wpmucdn.com is CampusPress's
    // SHARED CDN — it serves every CampusPress customer, not just Cornell. What bounds us to Cornell
    // is the `/blogs.cornell.edu/` path prefix, which is the CDN's per-customer namespace. It does
    // cover all Cornell blogs rather than only grapes/newfruit (the `dist/0/<id>/` segment is the
    // per-blog id and we would have to enumerate them), but we only ever enqueue a CDN url we found
    // by following a link from an already-admitted grape page, so reach is bounded by discovery too.
    // Documents are still filed under the REQUESTED blogs.cornell.edu url, so citations stay Cornell.
    seedRoots: ["https://blogs.cornell.edu/grapes/"],
    // WordPress core sitemap, under the multisite subpath rather than the host root.
    sitemapUrls: ["https://blogs.cornell.edu/grapes/wp-sitemap.xml"],
    allowPrefixes: ["/grapes/", "/newfruit/files/", "/blogs.cornell.edu/"],
    denyPrefixes: [
      // WordPress cruft + thin taxonomy/author/pagination archives
      "/grapes/wp-admin/",
      "/grapes/wp-json/",
      "/grapes/wp-includes/",
      "/grapes/wp-login",
      "/grapes/feed/",
      "/grapes/comments/",
      "/grapes/category/",
      "/grapes/tag/",
      "/grapes/author/",
      "/grapes/page/",
      // Events / news listings: dated announcements, not technical content.
      "/grapes/news-and-events/",
      // Cornell also runs hops and brewing extension programs. Their content must never enter this
      // corpus: verify-knowledge-base.ts asserts that a beer/IPA question surfaces NOTHING on-topic,
      // and wsu carries an equivalent deny for exactly this reason (its brewing certificate program).
      "/grapes/hops/",
      "/grapes/brewing/",
    ],
    // NOTE: crawlCadence is documentation only — nothing reads it to schedule anything. The monthly
    // refresh comes from omitting autoCrawl (defaults true), which enrolls this source in
    // .github/workflows/knowledge-recrawl.yml.
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "viticulture-extension-refs",
    publisher: "Regional viticulture extension publications",
    homeDomain: "nyshs.org",
    tier: 1,
    license:
      "Publicly published regional extension/research publications (NYSHS, USDA-SARE, USDA-ARS, UNH Extension, Cornell) — store paraphrasable text + a link back to the publisher.",
    // The grape site links out to a small set of technical PDFs hosted by OTHER publishers. They are
    // worth having, but they are NOT Cornell's, so they get their own source rather than being cited
    // under a Cornell byline — the assistant quotes the publisher when resolving conflicting advice
    // ("AWRI (tier 1, 2022) recommends X"), and a mis-attributed publisher corrupts that judgment.
    //
    // Curated, not crawled: these are ~11 specific documents scattered across 7 hosts with no common
    // path structure, and crawling those hosts generally would pull in tree fruit, berries, livestock
    // and field crops. The exact URL list lives in curated-specs.ts.
    //
    // They are static extension publications from 2004-2017, so being outside the monthly loop costs
    // nothing; the monthly cornell-grapes crawl still re-reads the linking pages and surfaces new ones.
    // Points at this source's OWN host, not at the Cornell page these were collected from. seedRoots[0]
    // determines the origin crawlSource probes for a sitemap, so naming blogs.cornell.edu here would aim
    // a sitemap probe at Cornell's university-wide multisite root on behalf of a source that is not
    // Cornell. (It cannot be empty: crawler.ts dereferences seedRoots[0] unconditionally.)
    seedRoots: ["https://nyshs.org/"],
    // EMPTY, not ["/"], and this matters. crawlUrls ignores allowPrefixes, but crawlSource and
    // crawlWithFollowing both read them (crawler.ts pathAllowed / pathAllowedFor), and this source's
    // six trusted hosts include whole extension sites covering tree fruit, berries and field crops. A
    // bare "/" here would make an operator-invoked `KB_SOURCES=…,viticulture-extension-refs
    // crawl:corpus` crawl all of them under a tier-1 byline. Empty fails closed: pathAllowed's
    // `.some()` returns false, so no path-driven crawl can ever enqueue anything for this source.
    allowPrefixes: [],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "awri",
    publisher: "AWRI",
    homeDomain: "awri.com.au",
    tier: 1,
    license: "Public AWRI industry resource — store paraphrasable text + a link back to the source.",
    seedRoots: [
      "https://www.awri.com.au/industry_support/winemaking_resources/",
      "https://www.awri.com.au/industry_support/viticulture/",
      "https://www.awri.com.au/information_services/fact-sheets/",
    ],
    allowPrefixes: [
      "/industry_support/winemaking_resources/",
      "/industry_support/viticulture/",
      "/information_services/fact-sheets/",
      "/wp-content/uploads/", // the PDF fact sheets, reached by following links from fact-sheet pages
    ],
    denyPrefixes: [
      "/information_services/technical_review/latest_issue/", // paywalled Technical Review (robots-disallowed)
      "/wp-admin/",
      "/cgi-bin/",
      "/tr/",
      "/zoom/",
    ],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "wine-australia",
    publisher: "Wine Australia",
    homeDomain: "wineaustralia.com",
    tier: 1,
    license: "Public Wine Australia grower/maker resource — store paraphrasable text + a link back.",
    seedRoots: ["https://www.wineaustralia.com/growing-making"],
    allowPrefixes: ["/growing-making", "/getmedia/"], // getmedia/<guid> serves the fact-sheet PDFs
    denyPrefixes: [],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "wsu",
    publisher: "WSU Viticulture & Enology",
    homeDomain: "wine.wsu.edu",
    tier: 1,
    license: "Public WSU Viticulture & Enology extension resource — store paraphrasable text + a link back.",
    // The technical viti/enology content is the /extension/ topic hubs, the /documents/ PDFs, the VEEN
    // newsletter (/viticulture-enology-extension-news-*), and root-level article slugs (e.g.
    // /managing-high-acidity-in-grape-must-and-wine/). Those root articles have no common prefix, so we
    // allow the whole host and DENY everything non-technical: WordPress cruft, event calendars, and all the
    // academic-program / staff / department-news / commerce sections (we want technical content, not the
    // department's org chart or event listings).
    seedRoots: ["https://wine.wsu.edu/extension/"],
    sitemapUrls: ["https://wine.wsu.edu/wp-sitemap.xml"], // WordPress core sitemap (non-standard path)
    allowPrefixes: ["/"],
    denyPrefixes: [
      // WordPress cruft + thin taxonomy/author/pagination archives
      "/wp-admin/",
      "/wp-content/", // theme assets; the real PDFs live under /documents/ (still allowed)
      "/wp-json/",
      "/wp-includes/",
      "/wp-login",
      "/feed/",
      "/comments/",
      "/category/",
      "/tag/",
      "/author/",
      "/page/",
      // The Events Calendar plugin: event/venue/organizer pages + ?ical exports = non-content noise
      "/events/",
      "/event/",
      "/venue/",
      "/organizer/",
      "/news/events/",
      // Academic program / department / staff / admissions pages — NOT technical viti/enology content
      "/certificate-program/", // whole program (course/enrollment admin, incl. the beer brewing cert)
      "/about/",
      "/people/",
      "/staff/",
      "/faculty/",
      "/employment/",
      "/jobs/",
      "/undergraduate-programs/",
      "/graduate-programs/",
      "/student-department-resources/",
      "/apply/",
      "/admissions/",
      "/courses/",
      // Department news + fundraising + commerce
      "/news/",
      "/ve-news/",
      "/give/",
      "/donate/",
      "/shop/",
      "/cart/",
      "/checkout/",
    ],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "osu-owri",
    publisher: "Oregon Wine Research Institute (OSU)",
    homeDomain: "ir.library.oregonstate.edu",
    tier: 1,
    license:
      "Oregon Wine Research Institute open-access research (ScholarsArchive@OSU) — reference use with citation + link back.",
    // Operator-directed: the collection LISTING pages (ungated) expose the /downloads/<id> PDF links
    // directly, so scripts/crawl-owri.ts walks the listing and fetches the PDFs — never touching the
    // JS-challenge-gated /concern/ item pages. Our UA (CellarhandKnowledgeBot) is permitted by robots '*'
    // for /collections/ + /downloads/ (the ClaudeBot Disallow is a different, named bot).
    seedRoots: ["https://ir.library.oregonstate.edu/collections/nz806494j"],
    allowPrefixes: ["/collections/", "/downloads/"],
    denyPrefixes: ["/concern/", "/catalog", "/advanced", "/users", "/roles", "/oai", "/files/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "osu-extension",
    publisher: "OSU Extension (Oregon State University)",
    homeDomain: "extension.oregonstate.edu",
    tier: 1,
    license:
      "OSU Extension Service public content — reference use with citation + link back (robots signals use=reference, ai-train=no; we do reference-use RAG, not training).",
    // Operator-directed + WINE/GRAPES ONLY. The wine articles live in a flat /catalog/ namespace shared
    // with ~4k unrelated pubs AND with beer/cider/spirits, so NOT prefix-crawlable. scripts/crawl-osu-
    // extension.ts fetches the two ALLOWED wine topic hubs (/crop-production/wine-grapes viticulture +
    // /food/wine-beer winemaking), extracts the /catalog/ + wine-grapes + economics-PDF links, and keeps
    // ONLY wine/grape content (positive wine/grape keyword required; beer/cider/spirits/hops/mead excluded).
    // The full /topic/.../resources listing is robots-disallowed + JS-rendered, so we stay on the hubs.
    // robots '*' = Allow: / and our UA (CellarhandKnowledgeBot) is not on their named training-crawler
    // blocklist (ClaudeBot/GPTBot/CCBot); no Crawl-delay declared, so we self-throttle.
    seedRoots: ["https://extension.oregonstate.edu/crop-production/wine-grapes"],
    allowPrefixes: ["/catalog/", "/crop-production/wine-grapes/", "/sites/"],
    denyPrefixes: ["/topic/", "/es/", "/search", "/video/", "/podcast"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "scott-labs",
    publisher: "Scott Laboratories",
    homeDomain: "scottlab.com",
    tier: 2, // VENDOR (product-biased): steers toward the Lallemand/Fermaid/Erbslöh SKUs it sells.
    license:
      "Proprietary Scott Laboratories educational content — store paraphrasable text + a link back; treat product/brand/dosage specifics as vendor-sourced, not independent authority.",
    // Operator-directed: /learn/ articles are bare root slugs intermixed with ~1,400 product pages AND
    // with cider/beer/seltzer/spirits articles — NOT separable by path prefix. scripts/crawl-scott-labs.ts
    // fetches the winemaking handbook PDF + a curated allow-list of WINE article slugs (the cider handbook
    // and beer/cider/spirits articles are deliberately omitted).
    seedRoots: [
      "https://scottlab.com/content/files/documents/handbooks/rev/scott%20laboratories%202025-2026%20winemaking%20handbook%20aug.pdf",
    ],
    allowPrefixes: ["/content/files/documents/handbooks/rev/"],
    denyPrefixes: ["/shop/", "/api/", "/search", "/admin", "/sandbox", "/news", "/cdn-cgi/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  // ── International sources (Plan 079 source expansion 2) — native-language, multilingual embeddings ──
  {
    key: "ifv-occitanie",
    publisher: "IFV Occitanie (Institut Français de la Vigne et du Vin)",
    homeDomain: "vignevin-occitanie.com",
    tier: 1,
    license: "IFV Occitanie public practical fact sheets (French) — reference use with citation + link back.",
    // Whole site is vine/wine. Fact sheets are one shared post type under /fiches-pratiques/ but are NOT in
    // the (broken) sitemap → discovered by link-following from the two listing pages. HTML only here (the 14
    // viticulture PDFs live under the denied /wp-content/uploads/ and are added via the curated engine).
    seedRoots: [
      "https://www.vignevin-occitanie.com/fiches-pratiques-en-viticulture/",
      "https://www.vignevin-occitanie.com/fiches-pratiques-en-oenologie/",
    ],
    allowPrefixes: ["/fiches-pratiques/", "/fondamentaux/"],
    denyPrefixes: ["/wp-admin/", "/wp-content/", "/wp-json/", "/wp-includes/", "/category/", "/author/", "/tag/", "/feed/", "/event/", "/location/", "/envira"],
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "ifv-france",
    publisher: "IFV France (Institut Français de la Vigne et du Vin)",
    homeDomain: "vignevin.com",
    tier: 1,
    license: "IFV national tools & technical guides (French) — reference use with citation + link back.",
    // /outils/ holds ~403 wine pages incl. ~392 yeast-strain fiches (/outils/fiches-levures/<strain>/) — a
    // structured yeast-selection library. All in the flat sitemap; allow only /outils/. HTML only.
    seedRoots: ["https://www.vignevin.com/outils/"],
    allowPrefixes: ["/outils/"],
    denyPrefixes: ["/wp-admin/", "/wp-content/", "/wp-json/", "/wp-includes/"],
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "umc",
    publisher: "Union des Maisons de Champagne",
    homeDomain: "maisons-champagne.com",
    tier: 1,
    license: "UMC Champagne elaboration encyclopedia (French) — reference use with citation + link back.",
    // The méthode champenoise authority: cuvée → tirage → prise de mousse → sur lies → dégorgement → dosage.
    // SCOPED to the physical-winemaking chapters (9 vigne, 10 vendanges/pressurage, 11 élaboration) — the
    // broader "connaissance du champagne" prefix pulled 867 URLs that are mostly SPIP aliases of ~181
    // articles (the same article under every chapter breadcrumb). Combined with the index-time alias dedup,
    // this keeps UMC focused on wine production. Non-www canonical (www 301→apex). Honor Crawl-delay 1.
    seedRoots: [
      "https://maisons-champagne.com/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-11-l-elaboration-du-champagne/",
      "https://maisons-champagne.com/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-10-les-vendanges-et-le-pressurage/",
      "https://maisons-champagne.com/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-9-la-vigne-et-sa-culture/",
    ],
    sitemapUrls: ["https://maisons-champagne.com/sitemap.xml"],
    allowPrefixes: [
      "/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-9-la-vigne-et-sa-culture/",
      "/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-10-les-vendanges-et-le-pressurage/",
      "/fr/encyclopedies/histoire-du-champagne/deuxieme-partie-connaissance-du-champagne/chapitre-11-l-elaboration-du-champagne/",
    ],
    denyPrefixes: ["/en/", "/local/", "/ecrire/", "/prive/", "/plugins", "/lib/", "/squelettes"],
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "icvv",
    publisher: "ICVV — Instituto de Ciencias de la Vid y del Vino (Spain)",
    homeDomain: "icvv.es",
    tier: 1,
    license: "ICVV applied viticulture & enology (Spanish) — reference use with citation + link back.",
    // Whole host is grapes/wine, but scoped to the CONTENT hubs (not whole-host) to skip news/team/admin
    // pages and avoid over-crawling. PDFs live under Drupal's /sites/default/files/, so allow that too.
    // No sitemap → link-following from the content hubs. Honor Crawl-delay 10 (via robots).
    seedRoots: [
      "https://www.icvv.es/divulgables",
      "https://www.icvv.es/memorias",
      "https://www.icvv.es/proyectos",
      "https://www.icvv.es/viticultura",
      "https://www.icvv.es/enologia",
      "https://www.icvv.es/seminarios-archivo",
    ],
    allowPrefixes: ["/divulgables", "/memorias", "/proyectos", "/viticultura", "/enologia", "/seminarios", "/sites/default/files/"],
    denyPrefixes: ["/admin/", "/search", "/user/", "/node/add", "/comment/", "/includes/", "/misc/", "/modules/", "/profiles/", "/scripts/", "/themes/"],
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "chambre-gironde",
    publisher: "Chambre d'Agriculture de la Gironde (Bordeaux)",
    homeDomain: "gironde.chambres-agriculture.fr",
    tier: 1,
    license: "Chambre d'Agriculture de la Gironde viticulture/œnology publications (French) — reference use with citation + link back.",
    // Curated: a flat PDF library mixed across all agriculture. The curated engine parses /nos-publications,
    // keeps only the wine-folder PDFs (/Viticulture__et_oenologie/, /Referentiel_Du_Vigneron/, + wine items
    // from /Agro-ecologie/). No usable sitemap.
    seedRoots: ["https://gironde.chambres-agriculture.fr/nos-publications"],
    allowPrefixes: ["/fileadmin/user_upload/295_chambre_dagriculture_de_la_gironde/"],
    denyPrefixes: ["/typo3", "/fileadmin/_"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "mapa",
    publisher: "MAPA — Ministerio de Agricultura (Spain)",
    homeDomain: "mapa.gob.es",
    tier: 1,
    license: "MAPA official integrated pest management guide for wine grapes (Spanish) — reference use with citation + link back.",
    // Curated single PDF: the official IPM guide for uva de transformación (wine grapes). Large (62 MB / 203 pp).
    seedRoots: ["https://www.mapa.gob.es/dam/mapa/contenido/agricultura/temas/medios-de-produccion/productos-fitosanitarios/uso-sostenible-de-productos-fitosanitarios/guias-de-gestion-integrada-de-plagas/guiauvadetransformacion.pdf"],
    allowPrefixes: ["/dam/"],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "wbi",
    publisher: "WBI Freiburg — Staatliches Weinbauinstitut (Germany)",
    homeDomain: "wbi.landwirtschaft-bw.de",
    tier: 1,
    license: "WBI Freiburg technical wine articles (German, public state institute) — reference use with citation + link back.",
    // Curated: the winemaking substance is in PDFs that robots blocks with a generic file-type rule
    // (/*.pdf$ — CMS boilerplate, NOT anti-AI; publicly served 200). Operator-directed PDF pull, honoring
    // Crawl-delay 2. Whole host is wine. The curated engine crawls the Fachinfo HTML hubs → collects PDFs.
    seedRoots: ["https://wbi.landwirtschaft-bw.de/,Lde/Startseite/Fachinfo"],
    allowPrefixes: ["/,Lde/", "/site/"],
    denyPrefixes: ["/recommend/", "/reportComment/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "lvwo",
    publisher: "LVWO Weinsberg (Germany)",
    homeDomain: "lvwo.landwirtschaft-bw.de",
    tier: 1,
    license: "LVWO Weinsberg technical wine articles (German, public state institute) — reference use with citation + link back.",
    // Curated: covers wine + fruit + distilling in a FLAT mixed namespace → the curated engine crawls only
    // the WINE topic hubs + German-keyword-filters, then collects their (robots-blocked, public) PDFs.
    seedRoots: ["https://lvwo.landwirtschaft-bw.de/,Lde/Startseite/Fachinformationen"],
    allowPrefixes: ["/,Lde/", "/site/"],
    denyPrefixes: ["/recommend/", "/reportComment/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "incavi",
    publisher: "INCAVI — Institut Català de la Vinya i el Vi (Catalonia)",
    homeDomain: "incavi.gencat.cat",
    tier: 1,
    license: "INCAVI technical/divulgation wine publications (Catalan) — reference use with citation + link back.",
    // Curated: the whole subdomain is INCAVI (Catalan wine institute); listings are JS-rendered so we fetch
    // the confirmed PDF assets under /content/dam/incavi/ directly.
    seedRoots: ["https://incavi.gencat.cat/ca/coneix-el-vi-catala/llibres-divulgatius"],
    allowPrefixes: ["/content/dam/incavi/", "/ca/"],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "laffort",
    publisher: "Laffort",
    homeDomain: "laffort.com",
    tier: 2, // VENDOR (product-biased enology supplier).
    license: "Proprietary Laffort protocol content — store paraphrasable text + a link back; treat product/brand/dosage specifics as vendor-sourced, not independent authority.",
    // Curated: the "Spark" sparkling protocol PDF (+ future FG_EN_*.pdf wine protocols).
    seedRoots: ["https://laffort.com/wp-content/uploads/Protocols/FG_EN_Spark.pdf"],
    allowPrefixes: ["/wp-content/uploads/Protocols/"],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "enartis",
    publisher: "Enartis",
    homeDomain: "enartis.com",
    tier: 2, // VENDOR (product-biased enology supplier).
    license: "Proprietary Enartis educational content — store paraphrasable text + a link back; treat product/brand/dosage specifics as vendor-sourced, not independent authority.",
    // Curated: the sparkling-wine playbook PDF.
    seedRoots: ["https://www.enartis.com/wp-content/uploads/2020/09/Enartis-Sparkling-Brochure-2020-EN.pdf"],
    allowPrefixes: ["/wp-content/uploads/"],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "ets",
    publisher: "ETS Laboratories",
    homeDomain: "etslabs.com",
    tier: 2, // commercial wine-analysis lab — but method-reference content (phenolics, microbiology, TCA), not product marketing.
    license:
      "ETS Laboratories technical publications — reference use with citation + link back; commercial analysis-lab method reference.",
    // NOT a crawl: etslabs.com/library is a JS-rendered React SPA with no PDFs and no server HTML. All 50
    // publications come from ONE public JSON endpoint (webapi.etslabs.com/cms/publications.json), each with
    // the full article HTML in a `content` field. scripts/crawl-ets.ts ingests that endpoint (skipping the 2
    // Biofuel Production items + disabled records); citations link to the /publications/publication/<id> page.
    // Issuu (issuu.com/etslabs) is deliberately NOT ingested — image-based flipbooks, no extractable text.
    seedRoots: ["https://www.etslabs.com/library"],
    allowPrefixes: ["/publications/"],
    denyPrefixes: [],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "vt-enology-notes",
    publisher: "Virginia Tech Enology",
    homeDomain: "enology.fst.vt.edu",
    tier: 1, // land-grant extension: Dr. Bruce Zoecklein, Enology-Grape Chemistry Group
    // Plan 084 / USER DECISION 2026-07-20: proceed cite-only. The site footer asserts "Images and
    // information contained on this site are copyrighted. Unauthorized use is prohibited." with NO
    // license grant, and there is no robots.txt to lean on (the host 404s it). Retrieval always
    // links back via /kb/source/<documentId> -> canonicalUrl.
    license:
      "© Virginia Polytechnic Institute and State University. All rights reserved; no license granted. " +
      "Retrieval with citation and link-back only — do not reproduce at length.",
    // Enumerated, NOT link-discovery dependent. crawler.ts `continue`s on HTTP 304 without following
    // links ("we don't have the body; rely on the sitemap seed"), and this archive has no sitemap —
    // so on the second monthly sweep an unchanged index page would stop re-enqueueing its children
    // and the crawl would quietly do nothing. Seeds are enqueued unconditionally, so enumeration is
    // the fix. The archive is static (ends 2013), so the list is complete by construction.
    seedRoots: [
      // NOTE: /EN/index.html is deliberately NOT seeded. It is a link dump (alphabetical subject
      // index + one-line summaries), and every issue and PDF below is enumerated explicitly, so it
      // buys no discovery. It is also denied outright — see denyPrefixes.
      ...Array.from({ length: 166 }, (_, i) => `https://enology.fst.vt.edu/EN/${i + 1}.html`),
      // #167-169 are PDF-only (their .html twins 404); #170 is published as four section files.
      "https://enology.fst.vt.edu/downloads/EnologyNotes167.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes168.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes169.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec1.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec2.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec3.pdf",
      "https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec4.pdf",
    ],
    // The PDF allow-prefixes are deliberately per-note, NOT a blanket "/downloads/". Notes #1-166
    // have PDF twins of pages we ALSO ingest as HTML — and the PDF path cannot be section-filtered
    // (no anchors), so allowing them would re-import the very announcements the filter just removed,
    // as a second, unfiltered document. Only the PDF-ONLY notes are reachable.
    allowPrefixes: [
      "/EN/",
      "/downloads/EnologyNotes167",
      "/downloads/EnologyNotes168",
      "/downloads/EnologyNotes169",
      "/downloads/EnologyNotes170_",
    ],
    // Navigation, not content. Both of these are anchorless, so they take the T1 fail-open path and
    // index as a pure link dump — verified in production: /EN/index.html produced 2 chunks of
    // subject-index links and truncated summaries, zero technical prose.
    //   - the 14 year pages: a list of links to the issues we already enumerate
    //   - /EN/index* : the landing page plus its five alphabetical index pages (indexae, indexfj,
    //     indexko, indexpt, indexuz). `crawl:source` does not follow links so these never appeared
    //     in the initial crawl, but the MONTHLY sweep runs crawlWithFollowing, which does — so
    //     without this they would silently arrive on the 1st. No issue url starts with "index".
    denyPrefixes: [
      ...Array.from({ length: 14 }, (_, i) => `/EN/${2000 + i}.html`),
      "/EN/index",
    ],
    // The whole point of this source: 166.html carries rot-metabolite chemistry AND a paid study
    // tour ad AND a staff hire announcement, all under ONE url. Path prefixes cannot express that.
    sectionFilter: "anchor-heading",
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "uc-ipm",
    publisher: "UC IPM (UC Agriculture & Natural Resources)",
    homeDomain: "ipm.ucanr.edu",
    tier: 1,
    license:
      "UC Statewide IPM Program content, © Regents of the University of California — public land-grant extension resource; reference use with citation + link back (same posture as the WSU/OSU extension sources).",
    // GRAPE ONLY, and cleanly prefix-scoped — unlike the OSU/Scott Labs sources, UC IPM namespaces every
    // grape Pest Management Guideline under /agriculture/grape/ (~90 topics: invertebrates, diseases,
    // nematodes, weeds, vertebrates, plus the year-round IPM program and monitoring supplements). That means
    // this is a normal autoCrawl source, not an operator script.
    //
    // robots.txt (checked 2026-07-20): /agriculture/grape/ is NOT disallowed. Their disallow list is
    // housekeeping (/tmp, /styles, /include, /mc-icons, /ADMIN) plus two substantive ones we honor below —
    // /PUSE (pesticide-use reporting data) and /page-view-* (their analytics endpoints). Note /PDF is
    // disallowed EXCEPT the explicitly Allowed /PDF/PUBS + /PDF/QTSP, so the publication PDFs are opted in
    // by the site itself. Do NOT add a "/PDF/" denyPrefix to mirror that: denyPrefixes are checked FIRST and
    // win unconditionally (crawler.ts:75 — no longest-match), so it would kill the /PDF/PUBS/ allow below.
    // It is unnecessary anyway — allowPrefixes is a whitelist, so any other /PDF/* path matches no allow and
    // is refused regardless. No Crawl-delay declared → the default 1500ms host throttle applies. Their robots
    // header asks crawlers to prefer evenings/weekends; the monthly job runs 09:00 UTC (~1-2am Pacific).
    //
    // No sitemap.xml (404) → link-following crawl from the grape hub.
    //
    // FRESHNESS IS SAFETY-RELEVANT here in a way it is not for the enology sources: these are pesticide
    // guidelines, so registrations get cancelled and REIs/resistance ratings change. UC IPM date-stamps
    // every guideline; keep publishedAt populated so the citation surfaces the revision date.
    seedRoots: ["https://ipm.ucanr.edu/agriculture/grape/"],
    allowPrefixes: ["/agriculture/grape/", "/PDF/PUBS/", "/PDF/QTSP/"],
    denyPrefixes: [
      // Mirrors of the robots.txt disallows that are reachable from grape pages.
      "/PUSE", // pesticide-use reporting data (robots-disallowed)
      "/page-view-", // their analytics endpoints
      "/tools",
      "/feedback",
      "/notices",
      "/WEATHER/CF-ARCHIVE",
      "/MODELS/",
      "/WATER/OPCALC",
      // Non-technical / non-grape noise reachable from the hub.
      "/legacy/",
      "/search",
    ],
    autoCrawl: true,
    crawlCadence: "monthly",
    defaultEnabled: true,
  },
  {
    key: "msu-grapes",
    publisher: "MSU Extension (Michigan State University)",
    homeDomain: "canr.msu.edu",
    tier: 1,
    license:
      "MSU Extension / MSU AgBioResearch content, © Michigan State University — public land-grant extension resource; reference use with citation + link back (same posture as the WSU/OSU/UC IPM extension sources).",
    // WHY THIS SOURCE: the corpus had no COLD-CLIMATE viticulture authority. AWRI and Wine Australia
    // are warm-climate, WSU/OSU are Pacific Northwest. Michigan is a genuinely cold site, and MSU's
    // cold-hardiness / winter-injury / spring-frost work is the best public material on the subject.
    //
    // robots.txt (checked 2026-07-20): disallows only /search and /application/, plus a blanket ban on
    // AhrefsBot (not us). Both mirrored below. Nothing under /grapes/ or /news/ is disallowed.
    //
    // THREE THINGS MAKE THIS SOURCE UNUSUAL:
    //
    // 1. NO SITEMAP (verified). /sitemap.xml and /sitemap_index.xml both return an HTML 404 page, so
    //    discovery is seed roots + link-following only. That is why `npm run crawl:source
    //    msu-grapes` needs --follow: without a sitemap the non-following path fetches the seed root
    //    and stops.
    //
    // 2. THE SUBSTANTIVE ARTICLES WE COULD REACH ARE NOT UNDER /grapes/ (partly INFERRED — see the
    //    caveat). Cold hardiness, mechanization and the scouting reports live at FLAT /news/<slug>
    //    urls. /news/ is also every other MSU Extension programme — dairy, field crops, 4-H,
    //    forestry — so no startsWith prefix selects the grape ones. Hence linkedOnlyPrefixes: a
    //    /news/ article is admitted only when a /grapes/ page linked to it, and it is TERMINAL so
    //    its own cross-links are never followed. See crawler.ts decideAdmission.
    //    ⚠️ CAVEAT: /grapes/viticulture/ was challenged on EVERY recon attempt, so the one subtree
    //    that could falsify this was never successfully fetched. The claim rests on a partial,
    //    WAF-truncated sample. Re-check after the first successful full crawl: if /grapes/ turns
    //    out to carry the technical content directly, linkedOnlyPrefixes may be unnecessary.
    //
    // 3. IT SITS BEHIND IMPERVA/INCAPSULA. Challenge pages come back HTTP 200 with content-type
    //    text/html, so they look like documents. crawl/challenge.ts detects and skips them, and the
    //    monthly job FAILS if this source is challenged and indexes nothing (findDarkSources). Be
    //    aware the block escalates with request volume: during recon a residential IP went from
    //    intermittent challenges to 5/5 refused after ~15 requests. A GitHub Actions datacenter IP
    //    may fare worse. If the monthly job reports msu-grapes dark, the fallback is autoCrawl:false
    //    plus an operator-run curated crawl — do NOT try to evade the WAF.
    //
    // Dates: MSU publishes JSON-LD, but as `2024-4-11EDT12:00AM` — unpadded, timezone jammed on, and
    // Invalid Date to any spec parser. Defuddle surfaces it and extract/published-date.ts salvages
    // the leading Y-M-D. The byline carries no label word, so the body-scan fallback cannot help;
    // that is why the metadata path had to be fixed rather than the label anchor loosened.
    seedRoots: ["https://www.canr.msu.edu/grapes/"],
    // /grapes/ (not /grapes/viticulture/) — it is the parent hub, it carries the grape news listing
    // that feeds the linkedOnly rule, and /grapes/viticulture/ was challenged on every recon attempt.
    allowPrefixes: ["/grapes/"],
    linkedOnlyPrefixes: [{ prefix: "/news/", linkedFrom: ["/grapes/"] }],
    denyPrefixes: [
      // Mirrors of the robots.txt disallows.
      "/search",
      "/application/",
      // Non-technical: a winery/tourism directory and staff bio pages.
      "/grapes/wine_tourism/",
      "/grapes/experts",
    ],
    // NOTE: /grapes/education is deliberately NOT denied — it may carry technical material. Revisit
    // after the first full crawl if it turns out to be event listings.
    //
    // ⛔ DORMANT — UNREACHABLE, NOT BROKEN. Imperva refuses this crawler from every network tried:
    // the operator's residential IP (5/5 refused after ~15 requests, across every user-agent) AND
    // GitHub Actions runners (`discovered: 1, fetched: 1, documents: 0, skippedChallenge: 1` on
    // https://www.canr.msu.edu/grapes/). So there is no path from which this source can be ingested.
    //
    // autoCrawl:false keeps it out of the monthly sweep, where it would otherwise land in
    // findDarkSources (challenged, zero documents) and red the job every month forever.
    // defaultEnabled:false keeps it from showing as an ON-but-permanently-empty toggle in every
    // tenant's Settings.
    //
    // Everything above this line is verified research and stays: the robots.txt check, the missing
    // sitemap, the /news/-from-/grapes/ provenance rule, and the JSON-LD date shape. Flip both flags
    // back the day a route exists. NOTE the fallback the plan describes — an operator-run curated
    // crawl — does NOT work either; a curated URL list still fetches from a blocked network. What is
    // needed is a network MSU will answer, not a different code path.
    autoCrawl: false,
    crawlCadence: "monthly",
    defaultEnabled: false,
  },
];

// Domains the crawler may follow links INTO (allowlist-gated cross-domain following). A link to a domain
// NOT listed here is logged to CandidateSource for human promotion, never crawled. Includes www + apex.
export const TRUSTED_DOMAINS: { domain: string; sourceKey?: string }[] = [
  // IVES Technical Reviews. Whole host is the journal, and crawl-ives.ts only ever fetches
  // /article/view/<id> URLs recovered from the journal's own OAI-PMH feed — so reach is bounded by
  // the feed, not just by the host.
  { domain: "ives-technicalreviews.eu", sourceKey: "ives-technical-reviews" },
  { domain: "www.ives-technicalreviews.eu", sourceKey: "ives-technical-reviews" },
  { domain: "enology.fst.vt.edu", sourceKey: "vt-enology-notes" },
  { domain: "www.enology.fst.vt.edu", sourceKey: "vt-enology-notes" }, // both hosts serve 200
  // Cornell's university-wide WordPress multisite. Trusting the HOST is unavoidable (the crawler gates
  // on hostname, never on path), so the cornell-grapes config's allowPrefixes are what actually keep the
  // crawl inside /grapes/ and /newfruit/files/. Do not add a source here with a bare "/" allow prefix.
  { domain: "blogs.cornell.edu", sourceKey: "cornell-grapes" },
  // CampusPress's CDN, where every blogs.cornell.edu upload actually lives — a page link to
  // /newfruit/files/x.pdf 302s to bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/0/<blog-id>/files/x.pdf.
  // Without this the host gate throws on the redirect hop and Cornell yields ZERO of its 43 PDFs.
  //
  // This is a SHARED CDN across CampusPress customers, so the host alone is a much wider boundary than
  // any other entry in this list. It is bounded by cornell-grapes' `/blogs.cornell.edu/` allowPrefix —
  // the CDN's per-customer namespace — NOT by the host. Do not reuse this domain for another source
  // without an equivalent path prefix, or that source can reach every CampusPress blog on the internet.
  { domain: "bpb-us-e1.wpmucdn.com", sourceKey: "cornell-grapes" },

  // Publishers of the specific technical PDFs the Cornell grape site links out to (curated source
  // viticulture-extension-refs). These entries are REQUIRED, not optional: crawlUrls gates every URL on
  // this set, so a curated spec cannot reach a host that is not listed here — that is the real cost of
  // ingesting these documents, and there is no way around it via the curated path.
  //
  // Blast radius is bounded but not zero. crawlWithFollowing only maps a trusted domain to a source when
  // that source is part of the run, and this source is autoCrawl:false, so the monthly loop never follows
  // links into these hosts. What DOES change: they stop being logged as CandidateSource (they are now
  // "known"), and any future crawl that includes this source could follow links within them.
  //
  // Kept to hosts that actually contribute a live document. Deliberately absent: hosts whose only
  // linked file is dead (ucanr.org, ucanr.edu, nmsp.cals.cornell.edu, vinebalance.com,
  // msue.anr.msu.edu, nysipm.cornell.edu), and extension.unh.edu, whose PDF redirects into a
  // robots-disallowed path — see the exclusion note in curated-specs.ts.
  { domain: "nyshs.org", sourceKey: "viticulture-extension-refs" },
  { domain: "www.sare.org", sourceKey: "viticulture-extension-refs" },
  { domain: "www.ars.usda.gov", sourceKey: "viticulture-extension-refs" },
  { domain: "www.hort.cornell.edu", sourceKey: "viticulture-extension-refs" },
  { domain: "harvestny.cce.cornell.edu", sourceKey: "viticulture-extension-refs" },
  { domain: "publications.dyson.cornell.edu", sourceKey: "viticulture-extension-refs" },

  { domain: "awri.com.au", sourceKey: "awri" },
  { domain: "www.awri.com.au", sourceKey: "awri" },
  { domain: "wineaustralia.com", sourceKey: "wine-australia" },
  { domain: "www.wineaustralia.com", sourceKey: "wine-australia" },
  { domain: "wine.wsu.edu", sourceKey: "wsu" },
  { domain: "ir.library.oregonstate.edu", sourceKey: "osu-owri" },
  { domain: "extension.oregonstate.edu", sourceKey: "osu-extension" },
  { domain: "scottlab.com", sourceKey: "scott-labs" },
  { domain: "vignevin-occitanie.com", sourceKey: "ifv-occitanie" },
  { domain: "www.vignevin-occitanie.com", sourceKey: "ifv-occitanie" },
  { domain: "vignevin.com", sourceKey: "ifv-france" },
  { domain: "www.vignevin.com", sourceKey: "ifv-france" },
  { domain: "maisons-champagne.com", sourceKey: "umc" },
  { domain: "www.maisons-champagne.com", sourceKey: "umc" },
  { domain: "icvv.es", sourceKey: "icvv" },
  { domain: "www.icvv.es", sourceKey: "icvv" },
  { domain: "gironde.chambres-agriculture.fr", sourceKey: "chambre-gironde" },
  { domain: "mapa.gob.es", sourceKey: "mapa" },
  { domain: "www.mapa.gob.es", sourceKey: "mapa" },
  { domain: "wbi.landwirtschaft-bw.de", sourceKey: "wbi" },
  { domain: "lvwo.landwirtschaft-bw.de", sourceKey: "lvwo" },
  { domain: "incavi.gencat.cat", sourceKey: "incavi" },
  { domain: "laffort.com", sourceKey: "laffort" },
  { domain: "www.laffort.com", sourceKey: "laffort" },
  { domain: "enartis.com", sourceKey: "enartis" },
  { domain: "www.enartis.com", sourceKey: "enartis" },
  { domain: "etslabs.com", sourceKey: "ets" },
  { domain: "www.etslabs.com", sourceKey: "ets" },
  { domain: "webapi.etslabs.com", sourceKey: "ets" }, // the JSON data host that crawl-ets.ts reads
  { domain: "ipm.ucanr.edu", sourceKey: "uc-ipm" },
  // MSU serves at www; the apex is listed too because homeDomain is the apex and the config test
  // asserts homeDomain membership. crawlWithFollowing registers homeDomain + www.<homeDomain> + every
  // TRUSTED_DOMAINS entry for the source, so both forms route correctly.
  { domain: "canr.msu.edu", sourceKey: "msu-grapes" },
  { domain: "www.canr.msu.edu", sourceKey: "msu-grapes" },
];

/**
 * Split the `knowledge_source` rows the DB says are active into the three buckets the monthly sweep
 * needs. UNKNOWN is its own bucket, and that is the whole point of this function.
 *
 * WHY: the DB table and this registry drift apart routinely, because seeding runs from whatever
 * checkout an operator happens to be in. A source seeded from an unmerged branch exists in the
 * GLOBAL (production) table while its config is nowhere on main.
 *
 * The sweep used to select with `findSourceConfig(s.key)?.autoCrawl !== false`. For an unknown key
 * that is `undefined !== false` → TRUE, so the unmerged source was INCLUDED, and crawlWithFollowing's
 * `if (!cfg) throw` then killed the run before a single page was fetched — taking every other
 * source's freshness with it. That is not hypothetical: `virginia-fruit` was seeded from a branch
 * that never merged, and the production sweep was dead for all 21 sources until this landed.
 *
 * Skipping beats throwing here: one operator's half-finished source must not be able to stop the
 * other twenty from refreshing. Callers are expected to report `unknown` loudly rather than swallow
 * it — a row that is stale should be deactivated, and one whose code is pending should merge.
 */
export function partitionSeededSources<T extends { key: string }>(
  activeRows: T[],
): { auto: T[]; curated: T[]; unknown: string[] } {
  const auto: T[] = [];
  const curated: T[] = [];
  const unknown: string[] = [];
  for (const row of activeRows) {
    const cfg = findSourceConfig(row.key);
    if (!cfg) unknown.push(row.key);
    else if (cfg.autoCrawl === false) curated.push(row);
    else auto.push(row);
  }
  return { auto, curated, unknown };
}

/** Set of trusted hostnames for O(1) gate checks (lowercased). */
export const TRUSTED_DOMAIN_SET: ReadonlySet<string> = new Set(
  TRUSTED_DOMAINS.map((d) => d.domain.toLowerCase()),
);

export function findSourceConfig(key: string): KnowledgeSourceConfig | undefined {
  return KNOWLEDGE_SOURCES.find((s) => s.key === key);
}
