// Plan 068 — inbox deep-link helpers. Deep links are DERIVED from sourceType+sourceId at render
// (council amendment 5 — no stored href column). Client-safe (no server imports).

export type InboxBucket = "all" | "wo" | "tickets" | "dm";

/** Map a polymorphic notification source to its deep link into /inbox. Returns null for an
 *  unrecognized source type (the reader tombstones it — amendment 6). */
export function deriveNotificationHref(sourceType: string, sourceId: string): string | null {
  switch (sourceType) {
    case "work_order":
      // A work order has a real standalone detail page, so link to the ITEM, not to a list. The old
      // `?bucket=wo&wo=<id>` stranded the reader on the WO bucket — the `wo=` sub-key was never
      // consumed by anything — and for a COMPLETED order it wasn't even in that list, since the
      // bucket defaults to the "open" filter. Tickets keep the bucket form because they have no
      // standalone page; `ticket=` is real precisely because InboxClient preselects it.
      return `/work-orders/${encodeURIComponent(sourceId)}`;
    case "feedback_ticket":
      return `/inbox?bucket=tickets&ticket=${encodeURIComponent(sourceId)}`;
    case "dm_thread":
      return `/inbox?bucket=dm&thread=${encodeURIComponent(sourceId)}`;
    case "weather_alert":
      // Plan 096 Phase 3 — a forecast frost/heat digest lands on the weather page (the strip +
      // badges are at the top; sourceId is the `${targetDate}:${tier}` digest key, no per-row page).
      return "/vineyards/weather";
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
