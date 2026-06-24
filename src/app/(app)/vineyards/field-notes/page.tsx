import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getLatestFieldNote } from "@/lib/fieldnotes/actions";
import { listFieldInputs } from "@/lib/fieldnotes/input-actions";
import { parseFieldNoteRow } from "@/lib/fieldnotes/types";
import { Card, Eyebrow } from "@/components/ui";
import { FieldNotesRouter } from "./FieldNotesRouter";
import { type FormBlock } from "./manager/FieldNoteForm";
import { type VineyardSummary } from "./admin/AdminDashboard";

// Columns to build a ParsedFieldNote (matches FieldNoteRowLike), mirrors actions.ts.
const fieldNoteSelect = {
  id: true,
  vineyardId: true,
  userId: true,
  userEmail: true,
  weekOf: true,
  weatherData: true,
  spraysApplied: true,
  fertilizersApplied: true,
  blockLevelStatuses: true,
  generalNotes: true,
  aiSummary: true,
  aiSummaryStatus: true,
  aiSummaryAt: true,
  schemaVersion: true,
  createdAt: true,
} as const;

export default async function FieldNotesPage() {
  const user = await requireReadyUser();

  if (user.role === "admin") {
    // All active vineyards + their blocks (for labels), and the latest note per
    // vineyard from ONE ordered findMany (pick latest per vineyard in JS).
    const [vineyards, notes] = await Promise.all([
      prisma.vineyard.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          blocks: { orderBy: { sortOrder: "asc" }, select: { id: true, blockLabel: true } },
        },
      }),
      prisma.fieldNote.findMany({
        orderBy: { weekOf: "desc" },
        select: fieldNoteSelect,
      }),
    ]);

    const latestByVineyard = new Map<string, (typeof notes)[number]>();
    for (const n of notes) {
      if (!latestByVineyard.has(n.vineyardId)) latestByVineyard.set(n.vineyardId, n);
    }

    const summaries: VineyardSummary[] = vineyards.map((v) => {
      const labels: Record<string, string> = {};
      v.blocks.forEach((b, i) => (labels[b.id] = b.blockLabel ?? `Block ${i + 1}`));
      const row = latestByVineyard.get(v.id);
      return {
        vineyardId: v.id,
        vineyardName: v.name,
        latestNote: row ? parseFieldNoteRow(row) : null,
        blockLabels: labels,
      };
    });

    // Top briefing: the single most-recently submitted note across all vineyards.
    const topBriefing = notes.length > 0 ? parseFieldNoteRow(notes[0]) : null;

    return (
      <FieldNotesRouter mode="admin" admin={{ vineyards: summaries, topBriefing }} />
    );
  }

  // ── Manager (role "user") ──
  if (!user.assignedVineyardId) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Eyebrow rule>Weekly field report</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 16px" }}>
          Field notes
        </h1>
        <Card>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            You haven&rsquo;t been assigned a vineyard yet. Ask an admin to assign your vineyard.
          </p>
        </Card>
      </div>
    );
  }

  const vineyardId = user.assignedVineyardId;
  const [vineyard, blockRows, latestNote, inputLists] = await Promise.all([
    prisma.vineyard.findUnique({ where: { id: vineyardId }, select: { id: true, name: true } }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, blockLabel: true, variety: { select: { name: true } } },
    }),
    getLatestFieldNote(vineyardId),
    listFieldInputs(),
  ]);

  if (!vineyard) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Eyebrow rule>Weekly field report</Eyebrow>
        <Card style={{ marginTop: 16 }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Your assigned vineyard could not be found. Ask an admin to re-assign your vineyard.
          </p>
        </Card>
      </div>
    );
  }

  const blocks: FormBlock[] = blockRows.map((b, i) => ({
    id: b.id,
    blockLabel: b.blockLabel ?? `Block ${i + 1}`,
    varietyName: b.variety?.name ?? null,
  }));

  return (
    <FieldNotesRouter
      mode="manager"
      manager={{
        vineyardId: vineyard.id,
        vineyardName: vineyard.name,
        blocks,
        latestNote,
        inputLists,
      }}
    />
  );
}
