// Plan 079 (source expansion 2) — declarative specs for CURATED sources (autoCrawl:false). The generic
// scripts/crawl-curated.ts reads a spec and produces the URL list to fetch: a fixed `directUrls` list,
// and/or a `discover` pass that fetches hub pages, follows same-host content links (bounded depth), and
// collects document URLs — filtered by path substring + native-language wine keywords. Native-language
// filtering (not English) is the new engineering bit for the international sources.

export interface CuratedDiscover {
  seeds: string[]; // hub/index pages to start discovery from
  followPathContains?: string[]; // same-host HTML links whose pathname contains one of these are followed (to reach sub-hubs)
  depth?: number; // how many follow levels (default 1); 0 = only extract from the seeds themselves
  keepPathContains?: string[]; // a collected doc URL's pathname must contain one of these (else dropped)
  pdfOnly?: boolean; // collect only links whose pathname ends in .pdf
  pos?: RegExp; // if set, a collected URL must match (native-language wine signal)
  neg?: RegExp; // if set, a collected URL (and a followed hub) must NOT match (other crops/beverages)
}

export interface CuratedSpec {
  sourceKey: string;
  directUrls?: string[]; // fixed URLs fetched as-is
  discover?: CuratedDiscover;
  ignoreRobots?: boolean; // for robots-disallowed-but-public PDFs (generic file-type block, not anti-AI)
  delayMs?: number; // polite per-host delay (crawlUrls also enforces robots Crawl-delay)
  maxBytes?: number; // override the default 15 MB read cap for a known-large PDF (e.g. MAPA 62 MB)
}

// German other-crop / other-beverage terms to exclude from LVWO (wine + fruit + distilling mixed).
const DE_NEG = /(obstbau|obst|frucht|brennerei|brennere|brand|destill|likör|kirsch|apfel|birne)/i;

export const CURATED_SPECS: CuratedSpec[] = [
  // ── Regional viticulture extension publications linked from the Cornell grape site (plan 084) ──
  //
  // Nine specific technical PDFs, six hosts, no shared path structure — and crawling these hosts
  // generally would pull in tree fruit, berries, livestock and field crops. So: an explicit list.
  // Static 2004-2017 extension publications; being outside the monthly loop costs nothing, and the
  // monthly cornell-grapes crawl still re-reads the linking pages so new references surface.
  //
  // NO ignoreRobots. Every host here was checked individually and permits these files. Two exclusions
  // were made for exactly that reason, and should NOT be "fixed" by adding them back:
  //
  //   * extension.unh.edu — the linked /resources/files/ URL 302s to
  //     /sites/default/files/migrated_unmanaged_files/…pdf, and UNH's robots.txt carries a global
  //     `Disallow: /sites/default/files/*.pdf$`. Robots is only evaluated against the REQUESTED url
  //     (crawler.ts), so the crawler would have fetched it without ever noticing the redirect landed
  //     somewhere disallowed. That is an accidental robots evasion, so the document is out.
  //   * ucanr.org, ucanr.edu, nmsp.cals.cornell.edu, vinebalance.com, msue.anr.msu.edu,
  //     nysipm.cornell.edu — linked file is dead (404, connection failure, or a soft-404 landing page).
  {
    sourceKey: "viticulture-extension-refs",
    directUrls: [
      // New York State Horticultural Society — NY Fruit Quarterly articles (bird damage, crown gall).
      "https://nyshs.org/wp-content/uploads/2016/10/15-18Agnello-Pages-NYFQ-Winter-2014-Book-4.pdf",
      "https://nyshs.org/wp-content/uploads/2016/10/Bye-Bye-Birdie-Repelling-Birds-From-Fruit-Plantings.pdf",
      "https://nyshs.org/wp-content/uploads/2016/10/Controlling-Birds-with-Netting-Blueberries-Cherries-and-Grapes.pdf",
      "https://nyshs.org/wp-content/uploads/2016/10/Burr-Pages-15-18-NYFQ-Book-Summer-2016.pdf",
      // USDA-SARE — Managing Cover Crops Profitably. The link on the Cornell page is the old
      // /publications/covercrops/ path, which 302s here; using the final URL avoids the redirect hop.
      "https://www.sare.org/wp-content/uploads/Managing-Cover-Crops-Profitably.pdf",
      // USDA-ARS — commercial storage of fruits and vegetables (post-harvest handling).
      "https://www.ars.usda.gov/ARSUserFiles/oc/np/CommercialStorage/CommercialStorage.pdf",
      // Cornell (other hosts than the grape blog).
      // NOTE: http, not https — www.hort.cornell.edu does not answer on 443. The fetcher permits http
      // (fetcher.ts) and this is a public read of a published factsheet, so it is left as linked.
      "http://www.hort.cornell.edu/expo/proceedings/2017/WildlifeMGMT.Birds%20NY%20Factsheet.Lindell%20et%20al.pdf",
      "https://harvestny.cce.cornell.edu/uploads/doc_40.pdf",
      "https://publications.dyson.cornell.edu/outreach/extensionpdf/2010/Cornell-Dyson-eb1015.pdf",
    ],
    delayMs: 1500,
  },
  // ── France ──
  {
    sourceKey: "chambre-gironde",
    // The wine PDFs from the mixed /Agro-ecologie/ folder can't be caught by a folder filter — list them.
    directUrls: [
      "https://gironde.chambres-agriculture.fr/fileadmin/user_upload/295_chambre_dagriculture_de_la_gironde/Interface/PDF/NOS_PUBLICATIONS/Agro-ecologie/Guide_Conduite_du_Vignoble_Bio_2024.pdf",
    ],
    discover: {
      seeds: ["https://gironde.chambres-agriculture.fr/nos-publications"],
      depth: 0, // the index page links directly to the PDFs
      pdfOnly: true,
      keepPathContains: ["/Viticulture__et_oenologie/", "/Referentiel_Du_Vigneron/"],
    },
    delayMs: 1500,
  },
  // ── Spain ──
  {
    sourceKey: "mapa",
    directUrls: [
      "https://www.mapa.gob.es/dam/mapa/contenido/agricultura/temas/medios-de-produccion/productos-fitosanitarios/uso-sostenible-de-productos-fitosanitarios/guias-de-gestion-integrada-de-plagas/guiauvadetransformacion.pdf",
    ],
    delayMs: 2000,
    maxBytes: 80 * 1024 * 1024, // the IPM guide is ~62 MB (default 15 MB cap would reject it)
  },
  {
    sourceKey: "incavi",
    // Listings are JS-rendered; fetch the confirmed Catalan PDF assets directly.
    directUrls: [
      "https://incavi.gencat.cat/content/dam/incavi/home/coneix-el-vi-català/llibres-divulgatius/a-taula-vins-catalans.pdf",
      "https://incavi.gencat.cat/content/dam/incavi/home/recerca/documentació-tècnica/20142018-Seguimento-tecnico-Pirene.pdf",
    ],
    delayMs: 2000,
  },
  // ── Germany (robots blocks all PDFs with a generic file-type rule; public 200; operator-directed) ──
  {
    sourceKey: "wbi",
    discover: {
      seeds: ["https://wbi.landwirtschaft-bw.de/,Lde/Startseite/Fachinfo"],
      followPathContains: ["/,Lde/Startseite/Fachinfo"], // follow the Fachinfo topic hubs
      depth: 1,
      pdfOnly: true, // whole host is wine — collect every linked PDF
    },
    ignoreRobots: true,
    delayMs: 2000, // honor Crawl-delay 2
  },
  {
    sourceKey: "lvwo",
    discover: {
      seeds: ["https://lvwo.landwirtschaft-bw.de/,Lde/Startseite/Fachinformationen"],
      followPathContains: ["/,Lde/Startseite/Fachinformationen"], // follow the topic hubs...
      depth: 1,
      pdfOnly: true,
      neg: DE_NEG, // ...but NOT the fruit/distilling hubs, and drop any fruit/distilling PDF
    },
    ignoreRobots: true,
    delayMs: 2000,
  },
  // ── Sparkling vendor PDFs ──
  {
    sourceKey: "laffort",
    directUrls: ["https://laffort.com/wp-content/uploads/Protocols/FG_EN_Spark.pdf"],
    delayMs: 1500,
  },
  {
    sourceKey: "enartis",
    directUrls: ["https://www.enartis.com/wp-content/uploads/2020/09/Enartis-Sparkling-Brochure-2020-EN.pdf"],
    delayMs: 1500,
  },
];

export function findCuratedSpec(key: string): CuratedSpec | undefined {
  return CURATED_SPECS.find((s) => s.sourceKey === key);
}
