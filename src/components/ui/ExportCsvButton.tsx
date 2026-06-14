"use client";

import React from "react";
import { Button } from "./Button";

export type CsvColumn = { key: string; label: string };

export interface ExportCsvButtonProps {
  filename: string;
  columns: CsvColumn[];
  rows: Array<Record<string, unknown>>;
  label?: string;
  disabled?: boolean;
}

function escapeCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ExportCsvButton({ filename, columns, rows, label = "Export CSV", disabled }: ExportCsvButtonProps) {
  function download() {
    const header = columns.map((c) => escapeCell(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(",")).join("\r\n");
    // Leading BOM so Google Sheets / Excel read UTF-8 (handles "Ser Kem Marp", accents).
    const csv = "﻿" + header + "\r\n" + body;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" size="sm" onClick={download} disabled={disabled || rows.length === 0}>
      {label}
    </Button>
  );
}
