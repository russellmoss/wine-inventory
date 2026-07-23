// A work order's requested due date AND time of day (ticket cmrwkmapf — "assign it for tomorrow at 9am").
//
// `WorkOrder.dueAt` has always been a DateTime, but every write path fed it a date-only string, so the
// clock time was unrepresentable. The instant alone can't say whether the user asked for "the 23rd" or
// "the 23rd at midnight", so the requested precision rides alongside it in `WorkOrder.dueAtHasTime`;
// this module is the one place that converts between the two and a human wall clock.
//
// TIMEZONE: the app stores instants (UTC) and renders in the VIEWER's timezone (see LocalTime). A wall
// clock like "09:00" is meaningless without a zone, and the server runs in UTC — so "tomorrow at 9am"
// typed by a crew member in California must be resolved against THEIR zone, not the server's, or it
// lands at 2am. Callers pass the zone: the browser knows its own, and the assistant threads the
// viewer's zone in from the chat request (see ToolContext.timeZone). UTC is the fail-safe default.
//
// Pure + isomorphic on purpose — client components, server actions, and the assistant tools all import
// it, and it is unit-tested in test/work-order-due-at.test.ts.

/** A requested due moment: the stored instant plus whether the user asked for a time of day. */
export type DueAt = { at: Date; hasTime: boolean };

/** `YYYY-MM-DD`, optionally followed by `T`/space and `HH:mm[:ss]`. */
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** A bare clock time: `9`, `9:30`, `09:30`, `0930`, with an optional am/pm. */
const CLOCK = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])\.?m\.?$|^(\d{1,2}):(\d{2})(?::\d{2})?$|^(\d{4})$/i;

/** Fall back to UTC for a missing or bogus zone rather than throwing — a due date is never worth a 500. */
export function normalizeTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return "UTC";
  const tz = timeZone.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

/** How far `timeZone` sits from UTC at a given instant (DST-aware), in ms. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"), at("second"));
  return asIfUtc - instant.getTime();
}

/**
 * Resolve a wall clock read in `timeZone` to the UTC instant it names.
 *
 * Two passes: the first guesses the offset from the wall clock treated as UTC, the second re-reads it at
 * the candidate instant so a DST changeover on the same day resolves to the offset actually in force.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = wallAsUtc - offsetMsAt(new Date(wallAsUtc), tz);
  return new Date(wallAsUtc - offsetMsAt(new Date(firstPass), tz));
}

/**
 * Parse a user/model-supplied due value into an instant + its requested precision.
 *
 * Accepts `YYYY-MM-DD` (date only), `YYYY-MM-DDTHH:mm` / `YYYY-MM-DD HH:mm` (a wall clock in `timeZone`,
 * which is what an `<input type="datetime-local">` emits), and a fully-zoned ISO string (`…Z` or `…+02:00`),
 * which is already an instant and is taken at face value. Anything else is null — callers treat that as
 * "no due date given" rather than guessing.
 */
export function parseDueAt(input: string | null | undefined, timeZone: string): DueAt | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw === "") return null;

  const wall = WALL_CLOCK.exec(raw);
  if (wall) {
    const [, y, mo, d, h, mi] = wall;
    const hasTime = h !== undefined;
    const at = zonedWallClockToUtc(Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0), timeZone);
    return Number.isNaN(at.getTime()) ? null : { at, hasTime };
  }

  // A zoned ISO instant (what a stored dueAt round-trips as). Already unambiguous — no zone math.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : { at, hasTime: true };
  }
  return null;
}

/**
 * Normalize a loose clock time to `HH:mm` (24h), or null if it isn't one.
 *
 * Deliberately tolerant: the assistant is told to send `HH:mm`, but models routinely emit "9am",
 * "9:00 AM" or "0900", and silently dropping the time would put the work order back at midnight —
 * exactly the failure this feature exists to fix.
 */
export function parseClockTime(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (raw === "") return null;
  const m = CLOCK.exec(raw);
  if (!m) return null;

  let hour: number;
  let minute: number;
  if (m[1] !== undefined) {
    // 12-hour with a meridiem: 12am → 00, 12pm → 12.
    hour = Number(m[1]) % 12;
    minute = Number(m[2] ?? "0");
    if (m[3] === "p") hour += 12;
  } else if (m[4] !== undefined) {
    hour = Number(m[4]);
    minute = Number(m[5]);
  } else {
    hour = Number(m[6].slice(0, 2));
    minute = Number(m[6].slice(2));
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Combine a `YYYY-MM-DD` date with an optional loose time into the wall-clock string `parseDueAt` takes.
 * Returns null when the date isn't a date; an unparseable time is dropped (date-only) rather than
 * poisoning the whole due date.
 */
export function combineDateAndTime(date: string | null | undefined, time?: string | null): string | null {
  if (typeof date !== "string") return null;
  const d = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    // Tolerate the model handing the whole thing over in one field ("2026-07-23T09:00").
    return typeof date === "string" && WALL_CLOCK.test(date.trim()) ? date.trim() : null;
  }
  const clock = parseClockTime(time ?? null);
  return clock ? `${d}T${clock}` : d;
}

/** The zone-local calendar date (`YYYY-MM-DD`) an instant falls on. */
export function zonedDateKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The zone-local `HH:mm` an instant falls on. */
export function zonedClock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const at2 = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${at2("hour")}:${at2("minute")}`;
}

/**
 * Human-readable due text for a confirmation preview or a spoken voice turn:
 * `2026-07-23` when only a date was asked for, `2026-07-23 at 9:00 AM` when a time was.
 */
export function formatDueAt(at: Date | null | undefined, hasTime: boolean, timeZone: string): string {
  if (!at || Number.isNaN(at.getTime())) return "";
  const tz = normalizeTimeZone(timeZone);
  const date = zonedDateKey(at, tz);
  if (!hasTime) return date;
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  return `${date} at ${clock}`;
}

/**
 * The wall-clock string form: `YYYY-MM-DDTHH:mm` when a time was requested, `YYYY-MM-DD` otherwise.
 * Empty string for no due date. Round-trips through `parseDueAt` in the same zone.
 */
export function toDateTimeLocalValue(at: Date | string | null | undefined, hasTime: boolean, timeZone: string): string {
  if (at == null) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const date = zonedDateKey(d, timeZone);
  return hasTime ? `${date}T${zonedClock(d, timeZone)}` : date;
}

/**
 * Split a stored due date into the two form controls the UI uses: an `<input type="date">` and an
 * optional `<input type="time">`.
 *
 * Two controls rather than one `datetime-local` because "a date with no time" has to stay expressible:
 * `datetime-local` rejects a date-only value (it renders blank), so it cannot represent the date-only
 * work orders that already exist, nor let a user clear a time they set by mistake. An empty `time` here
 * IS the date-only state.
 */
export function toDueInputs(
  at: Date | string | null | undefined,
  hasTime: boolean,
  timeZone: string,
): { date: string; time: string } {
  const value = toDateTimeLocalValue(at, hasTime, timeZone);
  if (value === "") return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date, time };
}

/** The viewer's IANA zone, for client components and the chat request. Never throws. */
export function browserTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "UTC";
  }
}
