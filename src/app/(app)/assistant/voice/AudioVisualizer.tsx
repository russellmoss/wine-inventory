"use client";

import React from "react";
import type { VoiceState } from "./useVoiceSession";

// The "face" of voice mode: a glowing orb that breathes with the live audio
// level. It reads the level through a getter every animation frame (not React
// state) so it stays smooth and never re-renders the tree. Colors come straight
// from the design tokens; honors prefers-reduced-motion with a gentle pulse.

type Props = {
  getLevel: () => number;
  state: VoiceState;
  size?: number;
};

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function AudioVisualizer({ getLevel, state, size = 220 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const smoothRef = React.useRef(0);
  const phaseRef = React.useRef(0);
  const stateRef = React.useRef<VoiceState>(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const accent = readToken("--accent", "#7a1f2b");
    const accentSoft = readToken("--accent-soft", accent);
    const muted = readToken("--text-muted", "#9a9a9a");

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.22;

    const draw = () => {
      const s = stateRef.current;
      // Idle/thinking shimmer when there's no real audio to react to.
      const raw = s === "listening" || s === "speaking" ? Math.min(getLevel() * 6, 1) : 0;
      // Smooth toward the target so the orb breathes rather than jitters.
      smoothRef.current += (raw - smoothRef.current) * 0.18;
      phaseRef.current += reduce ? 0.01 : 0.03;

      const idlePulse = (Math.sin(phaseRef.current) + 1) / 2; // 0..1
      const energy = s === "thinking" ? 0.25 + idlePulse * 0.15 : smoothRef.current;
      const color = s === "idle" || s === "error" ? muted : accent;

      ctx.clearRect(0, 0, size, size);

      // Outer glow rings scale with energy.
      const rings = 3;
      for (let i = rings; i >= 1; i--) {
        const t = i / rings;
        const r = baseR * (1 + t * 0.9) + energy * size * 0.16 * t;
        const grad = ctx.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, r);
        grad.addColorStop(0, hexWithAlpha(accentSoft, 0));
        grad.addColorStop(1, hexWithAlpha(color, 0.12 * (1 - t) + 0.04));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core orb.
      const coreR = baseR * (0.85 + energy * 0.5);
      const core = ctx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.3, coreR * 0.1, cx, cy, coreR);
      core.addColorStop(0, hexWithAlpha(color, 0.95));
      core.addColorStop(1, hexWithAlpha(color, 0.55));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [getLevel, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
}

// Accept #rgb / #rrggbb tokens and apply an alpha. Non-hex values (rare) fall
// back to the token as-is so we never crash the animation on an odd token.
function hexWithAlpha(color: string, alpha: number): string {
  const hex = color.startsWith("#") ? color.slice(1) : "";
  let r: number, g: number, b: number;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return color;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
