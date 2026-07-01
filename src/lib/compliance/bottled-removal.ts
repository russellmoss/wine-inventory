// Pure constants + type for bottled-wine removals (§B dispositions). NO server imports, so the
// client review screen can import the labels without dragging prisma/next-headers into the browser
// bundle. The server core (bottled-removal-core.ts) imports the type/guard from here.

export const BOTTLED_REMOVAL_DISPOSITIONS = ["TAXPAID", "TASTING", "EXPORT", "FAMILY_USE", "TESTING", "BREAKAGE"] as const;
export type BottledRemovalDisposition = (typeof BOTTLED_REMOVAL_DISPOSITIONS)[number];

export const BOTTLED_REMOVAL_LABELS: Record<BottledRemovalDisposition, string> = {
  TAXPAID: "Removed taxpaid (sold)",
  TASTING: "Used for tasting",
  EXPORT: "Removed for export",
  FAMILY_USE: "Removed for family use",
  TESTING: "Used for testing",
  BREAKAGE: "Breakage",
};

export const isBottledRemovalDisposition = (v: string): v is BottledRemovalDisposition =>
  (BOTTLED_REMOVAL_DISPOSITIONS as readonly string[]).includes(v);
