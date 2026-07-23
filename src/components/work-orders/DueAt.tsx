"use client";

import React from "react";
import { LocalTime } from "@/components/ui/LocalTime";
import { useWineryTimeZone } from "@/components/time/WineryTimeZoneProvider";
import { zoneAbbreviation } from "@/lib/work-orders/due-at";

/**
 * A work order's requested due moment.
 *
 * Rendered on the WINERY's clock when one is configured, because a work order is a place-bound
 * instruction: a 9am pumpover is the crew's 9am, and an owner reading from another country must not be
 * shown their own local equivalent as if it were the plan. With no winery zone configured it falls back
 * to viewer-local via LocalTime — the behaviour that shipped in #472.
 *
 * The clock time shows only when one was actually requested (`hasTime`). Every work order created
 * before that feature stored a date-only due date as midnight, and printing "12:00 AM" against all of
 * them would be noise that reads as real scheduling.
 */
export function DueAt({
  value,
  hasTime,
  dateOptions,
  emptyText = "—",
  showZone = false,
}: {
  value: string | number | Date | null | undefined;
  hasTime: boolean;
  /** Intl date options, e.g. `{ month: "short", day: "numeric" }`. The time parts are added here. */
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyText?: string;
  /**
   * Append the zone label ("PDT"). Worth it where precision matters and there's room — the detail page,
   * the printout the crew works from — and not on compact list cards. Ignored without a time of day
   * (a date needs no zone) and without a configured winery zone (it would just label the viewer's own).
   */
  showZone?: boolean;
}) {
  const { zone } = useWineryTimeZone();

  if (value == null || value === "") return <>{emptyText}</>;
  if (!hasTime) {
    // A date has no zone to disagree about, but WHICH date still depends on the clock you read it on,
    // so a configured winery zone still governs.
    return zone ? (
      <LocalTime value={value} mode="date" options={{ ...dateOptions, timeZone: zone }} fixed />
    ) : (
      <LocalTime value={value} mode="date" options={dateOptions} />
    );
  }

  // Intl renders ONLY the fields you name: handing toLocaleString hour+minute alone silently drops the
  // date, so a work order due tomorrow at 9am read just "Due 9:00 AM". Name the date parts explicitly
  // whenever the caller didn't (matching a bare toLocaleDateString()).
  const withDate: Intl.DateTimeFormatOptions = dateOptions ?? { year: "numeric", month: "numeric", day: "numeric" };
  const options: Intl.DateTimeFormatOptions = { ...withDate, hour: "numeric", minute: "2-digit" };

  if (!zone) return <LocalTime value={value} mode="datetime" options={options} />;

  // A configured winery zone is known on the SERVER, so this formats identically on both sides — no
  // hydration dance needed, unlike the viewer-local path. `fixed` tells LocalTime not to re-render.
  const suffix = showZone ? ` ${zoneAbbreviation(new Date(value), zone)}` : "";
  return (
    <>
      <LocalTime value={value} mode="datetime" options={{ ...options, timeZone: zone }} fixed />
      {suffix}
    </>
  );
}
