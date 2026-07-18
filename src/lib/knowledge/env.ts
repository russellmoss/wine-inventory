// Plan 079 — knowledge-base embedding provider config + credential gate.
// Voyage AI (a MongoDB company) is Anthropic's recommended embedding provider. Model + dim are committed
// for v1 (a vector(1024) column is single-dimension at DDL; a model change is a re-embed backfill, not a
// live swap — see ADR 0007). The dim is stored per chunk row so a future migration can detect stale rows.

export const KB_EMBEDDING_MODEL = "voyage-4";
export const KB_EMBEDDING_DIM = 1024;

/** True when the knowledge base can embed/retrieve. Mirrors hasBlobCredentials() — degrade, don't crash. */
export function hasVoyageCredentials(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/** The Voyage key, or a clear error telling the operator exactly what to set. */
export function getVoyageApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error(
      "VOYAGE_API_KEY is not set. The winemaking knowledge base needs a Voyage AI key to embed and " +
        "retrieve. Add VOYAGE_API_KEY to .env (and as a GitHub Actions secret for the re-crawl loop).",
    );
  }
  return key;
}
