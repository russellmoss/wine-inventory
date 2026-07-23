"use client";

import React from "react";
import { LocalTime } from "@/components/ui/LocalTime";

/**
 * A work order's requested due moment, rendered in the VIEWER's timezone.
 *
 * The clock time shows only when one was actually requested (`hasTime`) — every work order created
 * before this feature stored a date-only due date as midnight, and printing "12:00 AM" against all of
 * them would be noise that reads as real scheduling information. Wraps LocalTime, so it inherits the
 * hydration-safe formatting (server + first client render agree, then it re-renders locally).
 */
export function DueAt({
  value,
  hasTime,
  dateOptions,
  emptyText = "—",
}: {
  value: string | number | Date | null | undefined;
  hasTime: boolean;
  /** Intl date options, e.g. `{ month: "short", day: "numeric" }`. The time parts are added here. */
  dateOptions?: Intl.DateTimeFormatOptions;
  emptyText?: string;
}) {
  if (value == null || value === "") return <>{emptyText}</>;
  if (!hasTime) return <LocalTime value={value} mode="date" options={dateOptions} />;
  // Intl renders ONLY the fields you name: handing toLocaleString hour+minute alone silently drops the
  // date, so a work order due tomorrow at 9am read just "Due 9:00 AM". Name the date parts explicitly
  // whenever the caller didn't (matching a bare toLocaleDateString()).
  const withDate: Intl.DateTimeFormatOptions =
    dateOptions ?? { year: "numeric", month: "numeric", day: "numeric" };
  return <LocalTime value={value} mode="datetime" options={{ ...withDate, hour: "numeric", minute: "2-digit" }} />;
}
