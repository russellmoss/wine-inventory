import { describe, expect, it } from "vitest";
import { shouldStickToBottom, STICK_TO_BOTTOM_SLOP_PX } from "@/lib/assistant/scroll";

// clientHeight 400, scrollHeight 1000 -> the bottom is scrollTop 600.
const at = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 });

describe("transcript stick-to-bottom", () => {
  it("follows when pinned to the bottom", () => {
    expect(shouldStickToBottom(at(600))).toBe(true);
  });

  it("follows within the slop, so streaming drift is not mistaken for intent", () => {
    expect(shouldStickToBottom(at(600 - STICK_TO_BOTTOM_SLOP_PX))).toBe(true);
    expect(shouldStickToBottom(at(599))).toBe(true);
  });

  it("stops following once the user has scrolled away", () => {
    // The regression this exists for: mid-voice-conversation, the user scrolls up to
    // re-read a number. Every new turn used to yank them back to the bottom.
    expect(shouldStickToBottom(at(600 - STICK_TO_BOTTOM_SLOP_PX - 1))).toBe(false);
    expect(shouldStickToBottom(at(0))).toBe(false);
  });

  it("follows when the content does not fill the viewport yet", () => {
    // Otherwise the very first message would never scroll into view.
    expect(shouldStickToBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(true);
    expect(shouldStickToBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toBe(true);
  });

  it("honours a custom slop", () => {
    expect(shouldStickToBottom(at(500), 100)).toBe(true);
    expect(shouldStickToBottom(at(500), 50)).toBe(false);
  });

  it("treats an overscrolled position as pinned", () => {
    // Rubber-band scrolling on touch can report scrollTop past the true bottom.
    expect(shouldStickToBottom(at(650))).toBe(true);
  });
});
