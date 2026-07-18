// Plan 079 — embedding client. Provider-agnostic surface (embedTexts / embedQuery) with a Voyage impl.
// Kept behind a small interface + the model name stored per row so a future provider/model swap is a
// re-embed backfill, not an API rewrite. Voyage: input_type="document" for chunks, "query" for searches
// (measurably better retrieval). Validates the returned dimension so a bad vector never reaches pgvector.

import { KB_EMBEDDING_DIM, KB_EMBEDDING_MODEL, getVoyageApiKey } from "./env";

export type EmbedInputType = "document" | "query";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH = 96; // well under Voyage's per-request input cap
const MAX_RETRIES = 4;

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage?: { total_tokens: number };
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(texts: string[], inputType: EmbedInputType, key: string): Promise<number[][]> {
  let attempt = 0;
  for (;;) {
    attempt++;
    let res: Response;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts, model: KB_EMBEDDING_MODEL, input_type: inputType }),
      });
    } catch (e) {
      if (attempt > MAX_RETRIES) throw e;
      await sleep(backoffMs(attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt > MAX_RETRIES) {
        throw new Error(`Voyage embeddings failed after ${attempt} attempts (HTTP ${res.status}).`);
      }
      await sleep(backoffMs(attempt));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Voyage embeddings HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as VoyageEmbeddingResponse;
    // Voyage returns results with an `index`; sort so output order matches input order.
    const vecs = json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    if (vecs.length !== texts.length) {
      throw new Error(`Voyage returned ${vecs.length} embeddings for ${texts.length} inputs.`);
    }
    for (const v of vecs) {
      if (v.length !== KB_EMBEDDING_DIM || v.some((x) => !Number.isFinite(x))) {
        throw new Error(`Voyage returned an invalid vector (dim ${v.length}, expected ${KB_EMBEDDING_DIM}).`);
      }
    }
    return vecs;
  }
}

/** Embed a batch of texts. `inputType` MUST be "document" when embedding chunks and "query" at search time. */
export async function embedTexts(texts: string[], opts: { inputType: EmbedInputType }): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = getVoyageApiKey();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), opts.inputType, key)));
  }
  return out;
}

/** Embed a single search query (input_type="query"). */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text], { inputType: "query" });
  return vec;
}

export { KB_EMBEDDING_MODEL, KB_EMBEDDING_DIM };
