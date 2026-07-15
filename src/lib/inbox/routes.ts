// Plan 068 — inbox deep-link helpers. Deep links are DERIVED from sourceType+sourceId at render
// (council amendment 5 — no stored href column). Client-safe (no server imports).

export type InboxBucket = "all" | "wo" | "tickets" | "dm";

/** Map a polymorphic notification source to its deep link into /inbox. Returns null for an
 *  unrecognized source type (the reader tombstones it — amendment 6). */
export function deriveNotificationHref(sourceType: string, sourceId: string): string | null {
  switch (sourceType) {
    case "work_order":
      return `/inbox?bucket=wo&wo=${encodeURIComponent(sourceId)}`;
    case "feedback_ticket":
      return `/inbox?bucket=tickets&ticket=${encodeURIComponent(sourceId)}`;
    case "dm_thread":
      return `/inbox?bucket=dm&thread=${encodeURIComponent(sourceId)}`;
    default:
      return null;
  }
}

/** Build an /inbox URL for a bucket + optional filter (deep-linkable — requirement NICE). */
export function inboxHref(bucket: InboxBucket, filter?: string): string {
  const params = new URLSearchParams({ bucket });
  if (filter) params.set("filter", filter);
  return `/inbox?${params.toString()}`;
}

/** Coerce an untrusted searchParam into a known bucket (defaults to "all"). */
export function parseBucket(raw: string | null | undefined): InboxBucket {
  return raw === "wo" || raw === "tickets" || raw === "dm" ? raw : "all";
}
