"use client";

import React from "react";

type Mode = "date" | "time" | "datetime";

export interface LocalTimeProps {
  /** An ISO string, epoch ms, or Date. */
  value: string | number | Date;
  /** Which of toLocaleDateString / TimeString / String to mirror. Default "datetime". */
  mode?: Mode;
  /** Intl options, same as you'd pass to toLocale*String. */
  options?: Intl.DateTimeFormatOptions;
  /** Rendered for an absent/invalid date. */
  invalidText?: string;
  className?: string;
}

function fmt(d: Date, mode: Mode, options: Intl.DateTimeFormatOptions | undefined, locale?: string, timeZone?: string): string {
  const opts = timeZone ? { ...options, timeZone } : options;
  if (mode === "date") return d.toLocaleDateString(locale, opts);
  if (mode === "time") return d.toLocaleTimeString(locale, opts);
  return d.toLocaleString(locale, opts);
}

/**
 * Renders a timestamp in the VIEWER's local timezone without a hydration mismatch (Sentry #13).
 *
 * `new Date(x).toLocaleString()` in a client component's render is timezone- AND locale-dependent, so the
 * server (Node, UTC/en-US) and the browser (local tz/locale) produce different text — a hydration error on
 * every SSR'd first paint. Here the server and the FIRST client render both format with a FIXED locale +
 * timezone (en-US / UTC), so the two HTML strings are byte-identical; then a mount effect re-renders in the
 * viewer's real locale + timezone. `suppressHydrationWarning` is a backstop, not the mechanism.
 */
export function LocalTime({ value, mode = "datetime", options, invalidText = "", className }: LocalTimeProps) {
  const d = new Date(value);
  const valid = !Number.isNaN(d.getTime());

  // useSyncExternalStore gives a hydration-safe "am I past first paint?" without a setState-in-effect:
  // the server snapshot (false) is used for SSR AND the first client render, then it flips to the client
  // snapshot (true) once hydration settles — so the SSR and initial client HTML are identical.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!valid) return <span className={className}>{invalidText}</span>;

  const text = mounted ? fmt(d, mode, options) : fmt(d, mode, options, "en-US", "UTC");
  return (
    <time className={className} dateTime={d.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
