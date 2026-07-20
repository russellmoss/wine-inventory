// Plan 079 — the curated trusted-source registry. This is the MOAT and the crawl boundary: the crawler
// only fetches sources listed here, and only follows links INTO domains in TRUSTED_DOMAINS. Adding a
// source later is a config edit (re-run scripts/seed-knowledge-sources.ts), not code. AWRI is source #1,
// Wine Australia #2 (queued: UC Davis, Oregon State, Washington State, Cornell).

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
  // Plan 083 — strip non-technical SECTIONS from within a page before extraction. Only needed when
  // a source mixes technical and non-technical content inside ONE url, which path-prefix filtering
  // structurally cannot express (VT Enology Notes puts rot chemistry and a paid tour ad on the same
  // page). "anchor-heading" = split on <a name="N"> anchors, classify by heading text. Config-only,
  // like sitemapUrls/autoCrawl — the seed script does not persist it, so no migration.
  sectionFilter?: "anchor-heading";
  crawlCadence: string;
  defaultEnabled: boolean;
}

export const KNOWLEDGE_SOURCES: KnowledgeSourceConfig[] = [
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
];

// Domains the crawler may follow links INTO (allowlist-gated cross-domain following). A link to a domain
// NOT listed here is logged to CandidateSource for human promotion, never crawled. Includes www + apex.
export const TRUSTED_DOMAINS: { domain: string; sourceKey?: string }[] = [
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
];

/** Set of trusted hostnames for O(1) gate checks (lowercased). */
export const TRUSTED_DOMAIN_SET: ReadonlySet<string> = new Set(
  TRUSTED_DOMAINS.map((d) => d.domain.toLowerCase()),
);

export function findSourceConfig(key: string): KnowledgeSourceConfig | undefined {
  return KNOWLEDGE_SOURCES.find((s) => s.key === key);
}
