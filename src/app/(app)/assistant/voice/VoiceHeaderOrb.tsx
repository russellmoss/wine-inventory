"use client";

import React from "react";
import { orbShouldAnimate, voiceStatusLabel } from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";
import { AudioVisualizer } from "./AudioVisualizer";

// The voice status indicator that lives in the assistant dock's title bar.
//
// Three constraints shaped this, and all three are easy to break by accident:
//
// 1. POINTER-INERT. The dock's title bar is its drag handle, and that handler only
//    bails on `closest("button")` (AssistantDock.tsx). A <canvas> is not a button, so
//    without `pointer-events: none` a drag started on the orb would be swallowed.
//    Deliberately not solved by extending the bail-out list: the next person to add a
//    header element would re-break it. The orb has no interaction, so it takes no
//    pointers, full stop.
// 2. SILENT TO SCREEN READERS. The panel owns the single aria-live region. This is
//    decoration for the sighted; announcing it here too would double every transition.
// 3. STILL UNLESS AUDIO IS FLOWING. See orbShouldAnimate — DESIGN.md forbids
//    decorative animation, and this element is persistent chrome.

export function VoiceHeaderOrb({ state, getLevel }: { state: VoiceState; getLevel: () => number }) {
  return (
    <span
      // aria-hidden + pointer-events:none: see (1) and (2) above.
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        minWidth: 0,
      }}
    >
      <AudioVisualizer getLevel={getLevel} state={state} size={28} animate={orbShouldAnimate(state)} />
      <span
        // Below a narrow panel the word is the first thing to go; the orb alone still
        // says "voice is on". `container` units would be nicer but the dock is sized
        // imperatively in px during a drag, so a media query is the honest tool here.
        className="voice-orb-label"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: state === "error" ? "var(--danger)" : "var(--text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {voiceStatusLabel(state)}
      </span>
      <style>{`@media (max-width: 420px) { .voice-orb-label { display: none; } }`}</style>
    </span>
  );
}
