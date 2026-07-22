import { describe, it, expect } from "vitest";
import { isDevNoiseEvent, dropDevNoise } from "@/lib/observability/dev-noise";

// Shapes here mirror the real Sentry events that /bug-triage closed as dev-noise
// (#446-#450) and the one it kept as a genuine production defect (#324).

describe("isDevNoiseEvent", () => {
  it("drops an event whose worktree path is only in a DEEP frame", () => {
    // The trap that once mislabelled a stale error as a real bug: the top frames
    // look production-clean and only a lower frame carries the tell.
    expect(
      isDevNoiseEvent({
        exception: {
          values: [
            {
              value: "Can't reach database server",
              stacktrace: {
                frames: [
                  { filename: "src\\lib\\prisma.ts" },
                  { filename: "src\\app\\(app)\\page.tsx" },
                  {
                    abs_path:
                      "C:\\Users\\r\\Documents\\Wine-inventory\\.claude\\worktrees\\vigorous-nash-2fe4be\\.next\\dev\\server\\chunks\\ssr\\x.js",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops a .next/dev SSR chunk on either slash style", () => {
    for (const filename of [
      ".next\\dev\\server\\chunks\\ssr\\[root-of-the-server].js",
      "/home/r/app/.next/dev/server/chunks/ssr/x.js",
    ]) {
      expect(isDevNoiseEvent({ exception: { values: [{ stacktrace: { frames: [{ filename }] } }] } })).toBe(true);
    }
  });

  it("drops when the only tell is a Turbopack-mangled module id", () => {
    expect(
      isDevNoiseEvent({
        exception: {
          values: [
            {
              value:
                "imported module ./.claude/worktrees/vigorous-nash-2fe4be/src/lib/prisma.ts",
              stacktrace: { frames: [{ filename: "src/lib/prisma.ts" }] },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("drops on culprit or transaction alone", () => {
    expect(isDevNoiseEvent({ culprit: ".claude/worktrees/foo/src/lib/prisma.ts" })).toBe(true);
    expect(isDevNoiseEvent({ transaction: "C:\\repo\\.next\\dev\\server\\app\\page.js" })).toBe(true);
  });

  it("KEEPS a genuine production event (#324 shape)", () => {
    expect(
      isDevNoiseEvent({
        culprit: "src/components/ui/SatelliteMap.tsx",
        exception: {
          values: [
            {
              value: "Cannot read properties of undefined (reading '_leaflet_pos')",
              stacktrace: {
                frames: [
                  { filename: "/var/task/.next/server/chunks/x.js", module: "leaflet" },
                  { filename: "src/components/ui/SatelliteMap.tsx" },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("KEEPS a production .next build — only a `dev` segment is noise", () => {
    expect(
      isDevNoiseEvent({
        exception: {
          values: [{ stacktrace: { frames: [{ filename: "/var/task/.next/server/app/page.js" }] } }],
        },
      }),
    ).toBe(false);
  });

  it("does not match the word 'development' or an unrelated 'dev' path", () => {
    expect(isDevNoiseEvent({ culprit: "src/lib/dev-tools/seed.ts" })).toBe(false);
    expect(isDevNoiseEvent({ message: "running in development mode" })).toBe(false);
  });

  it("never throws on malformed or empty events", () => {
    expect(isDevNoiseEvent({})).toBe(false);
    expect(isDevNoiseEvent({ exception: { values: null } as never })).toBe(false);
    expect(isDevNoiseEvent({ exception: "not-an-object" })).toBe(false);
    expect(isDevNoiseEvent({ message: { formatted: 42 } })).toBe(false);
  });
});

describe("dropDevNoise", () => {
  it("returns null for noise and the event itself otherwise", () => {
    const noise = { culprit: ".claude/worktrees/x/src/lib/prisma.ts" };
    const real = { culprit: "src/components/ui/SatelliteMap.tsx" };
    expect(dropDevNoise(noise)).toBeNull();
    expect(dropDevNoise(real)).toBe(real);
  });
});
