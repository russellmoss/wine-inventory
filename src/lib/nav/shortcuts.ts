/**
 * Keyboard shortcuts: what we MATCH vs what we DISPLAY.
 *
 * ## Display: Ctrl, never ⌘ (owner instruction, 2026-07-28)
 * The design handoff writes every shortcut as `⌘K`. This winery runs on Windows,
 * so a ⌘ glyph is not a stylistic preference, it is a hint for a key the crew's
 * keyboards do not have. **Deliberate deviation from the handoff**, recorded here
 * and in plan 103 rather than silently reconciled.
 *
 * ## Matching: still accept both
 * The HANDLER accepts `metaKey` as well as `ctrlKey`, so if anyone ever does open
 * this on a Mac the shortcut still fires. We simply never advertise it. Refusing
 * to match a real key press would be a bug; refusing to advertise it is a choice.
 *
 * A static guard (test/no-mac-glyphs.test.ts) fails if a ⌘/⌥/⌃/⇧ glyph enters
 * `src/`.
 */

/** How a shortcut is written in the UI. Ctrl, spelled out, no glyphs. */
export const KEY_HINT = {
  palette: "Ctrl K",
  paletteLong: "Ctrl + K",
  rail: "Ctrl \\",
  submit: "Ctrl Enter",
  close: "Esc",
} as const;

export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey?: boolean;
}

/** Ctrl-K (and Cmd-K, unadvertised) opens the command palette. */
export function isPaletteShortcut(e: ShortcutEvent): boolean {
  return e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey);
}

/** Shift-Enter on the Ask row opens the dock with the question. */
export function isAskShortcut(e: ShortcutEvent): boolean {
  return e.key === "Enter" && e.shiftKey === true;
}
