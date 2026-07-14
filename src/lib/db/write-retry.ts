import { Prisma } from "@prisma/client";

/**
 * The single canonical retry wrapper for Postgres serialization/deadlock aborts (D18/H2).
 *
 * Prisma surfaces SQLSTATE 40001 (serialization failure under SERIALIZABLE) and 40P01 (deadlock) as
 * error code P2034. SSI aborts the losing transaction with NO automatic retry, so without this a
 * transient, correct-to-retry conflict becomes a user-facing 500. Every SERIALIZABLE write path — the
 * ledger chokepoint (`runLedgerWrite`), stock movements, bottling, and work-order maintenance
 * completion/undo — wraps its transaction in this.
 *
 * Bounded (cap `attempts`) with full-jitter exponential backoff so a burst of conflicts doesn't
 * thundering-herd, and each retry is logged with a domain `label` so rising serialization contention is
 * OBSERVABLE (Vercel logs / Sentry breadcrumbs) instead of silent — the "logged/observable" half of H2.
 */
const RETRY_CODE = "P2034";

export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 5, label = "write"): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
      if (code === RETRY_CODE && i < attempts) {
        // Full-jitter exponential backoff: base 25ms, doubling, capped at 500ms.
        const ceil = Math.min(500, 25 * 2 ** (i - 1));
        const delay = Math.floor(Math.random() * ceil);
        console.warn(`[write-retry] ${label}: serialization conflict (P2034) on attempt ${i}/${attempts}; retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
}
