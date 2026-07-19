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
