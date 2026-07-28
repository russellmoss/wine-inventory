import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { isTenantAdminLike } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getLatestFieldNote } from "@/lib/fieldnotes/actions";
import { listFieldInputs } from "@/lib/fieldnotes/input-actions";
import { parseFieldNoteRow } from "@/lib/fieldnotes/types";
import { Card, Eyebrow } from "@/components/ui";
import { FieldNotesRouter } from "./FieldNotesRouter";
import { AdminViewToggle } from "../AdminViewToggle";
import { ManagerVineyardSwitcher } from "../ManagerVineyardSwitcher";
import { type FormBlock } from "./manager/FieldNoteForm";
import { type VineyardSummary } from "./admin/AdminDashboard";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

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

type FieldNotesPageProps = { searchParams: Promise<{ view?: string; vineyard?: string }> };

/**
 * Plan 104 Unit 10 — Map Explorer, Weather and Spray records hang off Vineyard
 * rounds. All three were sidebar entries before Phase 3 and had no way in after it.
 * Wrapped rather than inlined: the body returns from six places.
 */
export default async function FieldNotesPage(props: FieldNotesPageProps) {
  return (
    <>
      <HubSectionNav hub="/vineyards/field-notes" />
      <FieldNotesHubBody {...props} />
    </>
  );
}

async function FieldNotesHubBody({ searchParams }: FieldNotesPageProps) {
  const user = await requireReadyUser();
  await requireActiveTenant();

  // `isTenantAdminLike`, not a strict role === "admin": a developer is "admin-like in every
  // tenant" (src/lib/access.ts) and already gets the admin view on all three sibling vineyard
  // pages — harvest, maps, and weather. Field notes was the only one comparing the raw role, so a
  // developer fell through to the manager branch and hit "You haven't been assigned a vineyard
  // yet" with no way to reach either view. This grants nothing the app does not already grant.
  if (isTenantAdminLike(user)) {
    const sp = await searchParams;
    const view = sp.view === "manager" ? "manager" : "admin";

    // Admin "Manager view": fill in a field report for any chosen vineyard.
    if (view === "manager") {
      const vineyardList = await prisma.vineyard.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      const selected = vineyardList.find((v) => v.id === sp.vineyard) ?? vineyardList[0];
      if (!selected) {
        return (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <AdminViewToggle view="manager" />
            <Card>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                No active vineyards yet. Add one under Setup → Varieties &amp; vineyards.
              </p>
            </Card>
          </div>
        );
      }
      const vineyardId = selected.id;
      const [blockRows, latestNote, inputLists] = await Promise.all([
        prisma.vineyardBlock.findMany({
          where: { vineyardId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, blockLabel: true, variety: { select: { name: true } } },
        }),
        getLatestFieldNote(vineyardId),
        listFieldInputs(),
      ]);
      const blocks: FormBlock[] = blockRows.map((b, i) => ({
        id: b.id,
        blockLabel: b.blockLabel ?? `Block ${i + 1}`,
        varietyName: b.variety?.name ?? null,
      }));
      return (
        <div>
          <AdminViewToggle view="manager" vineyards={vineyardList} selectedVineyardId={vineyardId} />
          <FieldNotesRouter
            key={vineyardId}
            mode="manager"
            manager={{ vineyardId, vineyardName: selected.name, blocks, latestNote, inputLists }}
          />
        </div>
      );
    }

    // Admin dashboard (review). All active vineyards + their blocks (for labels),
    // and the latest note per vineyard from ONE ordered findMany.
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

    return (
      <div>
        <AdminViewToggle view="admin" />
        <FieldNotesRouter mode="admin" admin={{ vineyards: summaries }} />
      </div>
    );
  }

  // ── Manager (role "user") ── D9: a manager may belong to N vineyards; single-vineyard
  // managers are unchanged (the switcher renders nothing).
  if (user.vineyardIds.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Eyebrow rule>Field report</Eyebrow>
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

  const mgrSp = await searchParams;
  const vineyardId =
    mgrSp.vineyard && user.vineyardIds.includes(mgrSp.vineyard) ? mgrSp.vineyard : user.vineyardIds[0];
  const myVineyards =
    user.vineyardIds.length > 1
      ? await prisma.vineyard.findMany({
          where: { id: { in: user.vineyardIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
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
        <Eyebrow rule>Field report</Eyebrow>
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
    <div>
      <ManagerVineyardSwitcher vineyards={myVineyards} selectedId={vineyardId} />
      <FieldNotesRouter
        key={vineyardId}
        mode="manager"
        manager={{
          vineyardId: vineyard.id,
          vineyardName: vineyard.name,
          blocks,
          latestNote,
          inputLists,
        }}
      />
    </div>
  );
}
