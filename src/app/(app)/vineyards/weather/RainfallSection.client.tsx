"use client";

// ssr:false wrapper (the StationMap.client idiom) — RainfallSection reads localStorage in its lazy
// state initializers, so it must never server-render (no hydration split, no window guard gymnastics).

import dynamic from "next/dynamic";

export const RainfallSectionClient = dynamic(() => import("./RainfallSection").then((m) => m.RainfallSection), {
  ssr: false,
  loading: () => <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading rainfall…</div>,
});
