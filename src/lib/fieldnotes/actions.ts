"use server";

import { revalidatePath } from "next/cache";
import { requireTenantId } from "@/lib/tenant/context";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, getActionUser, ActionError } from "@/lib/actions";
import { canManagerAccessVineyard } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { isValidReportDate, parseISODateUTC } from "@/lib/fieldnotes/week";
import {
  SCHEMA_VERSION,
  parseWeatherData,
  parseInputApplications,
  parseBlockStatuses,
  parseFieldNoteRow,
  type CreateFieldNoteInput,
  type ParsedFieldNote,
} from "@/lib/fieldnotes/types";

const PATH = "/vineyards/field-notes";

// Columns needed to build a ParsedFieldNote (matches FieldNoteRowLike).
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

/** Throw FORBIDDEN unless the acting user may touch this vineyard. */
async function requireVineyardAccess(vineyardId: string) {
  const user = await getActionUser();
  if (!canManagerAccessVineyard(user, vineyardId)) {
    throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
  }
  return user;
}

/**
 * Save a report for a vineyard on a given date. Manager-scoped (admins any
 * vineyard). Validates the report date (real date, not future), the JSON
 * payloads, and that every current block has a status. One report per vineyard
 * per calendar day (unique) — re-saving the same day UPDATES that report in
 * place (edit + resubmit), it does not create a duplicate. Reports may be filed
 * any day; there is no longer a weekly cadence.
 */
export const createFieldNote = action(
  async ({ actor }, input: CreateFieldNoteInput): Promise<{ id: string }> => {
    const { vineyardId } = input;
    if (!vineyardId) throw new ActionError("Missing vineyard.");
    await requireVineyardAccess(vineyardId);

    if (!isValidReportDate(input.weekOf)) {
      throw new ActionError("Pick a valid report date (today or earlier).");
    }
    const weekOf = parseISODateUTC(input.weekOf)!;

    // Validate JSON payloads up front (throws FieldNoteParseError on malformed).
    let weatherData, spraysApplied, fertilizersApplied, blockLevelStatuses;
    try {
      weatherData = parseWeatherData(input.weatherData);
      spraysApplied = parseInputApplications(input.spraysApplied);
      fertilizersApplied = parseInputApplications(input.fertilizersApplied);
      blockLevelStatuses = parseBlockStatuses(input.blockLevelStatuses);
    } catch {
      throw new ActionError("Report data is malformed. Please retry.");
    }

    // Block coverage: every CURRENT block of this vineyard must have a status.
    const blocks = await prisma.vineyardBlock.findMany({
      where: { vineyardId },
      select: { id: true },
    });
    const missing = blocks.filter((b) => !(b.id in blockLevelStatuses));
    if (missing.length > 0) {
      throw new ActionError(`${missing.length} block(s) are missing a status.`);
    }
    // Persist statuses for current blocks only (drop any stale/extra keys).
    const cleanStatuses: Record<string, unknown> = {};
    for (const b of blocks) cleanStatuses[b.id] = blockLevelStatuses[b.id];

    // Common payload for both insert and update of the canonical day's report.
    const data = {
      userId: actor.actorUserId,
      userEmail: actor.actorEmail,
      weatherData: weatherData as Prisma.InputJsonValue,
      spraysApplied: spraysApplied as unknown as Prisma.InputJsonValue,
      fertilizersApplied: fertilizersApplied as unknown as Prisma.InputJsonValue,
      blockLevelStatuses: cleanStatuses as Prisma.InputJsonValue,
      generalNotes: input.generalNotes?.trim() || null,
      schemaVersion: SCHEMA_VERSION,
      // Re-queue the AI briefing on every save so an edited report regenerates.
      aiSummaryStatus: "PENDING",
    };

    const note = await runInTenantTx(async (tx) => {
      // Detect create-vs-edit up front so the audit trail is accurate. The
      // (vineyardId, weekOf) unique makes this race-safe under the upsert below.
      const existing = await tx.fieldNote.findFirst({
        where: { vineyardId, weekOf },
        select: { id: true },
      });
      const saved = await tx.fieldNote.upsert({
        where: { tenantId_vineyardId_weekOf: { tenantId: requireTenantId(), vineyardId, weekOf } },
        create: { vineyardId, weekOf, ...data },
        update: data,
        select: { id: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: existing ? "UPDATE" : "FIELD_NOTE_CREATED",
        entityType: "FieldNote",
        entityId: saved.id,
        summary: `${existing ? "Updated" : "Logged"} field note for ${input.weekOf}`,
      });
      return saved;
    });
    revalidatePath(PATH);
    return { id: note.id };
  },
);

/** Latest report for a vineyard (pre-population baseline + manager card). Scoped. */
export async function getLatestFieldNote(vineyardId: string): Promise<ParsedFieldNote | null> {
  await requireVineyardAccess(vineyardId);
  const row = await prisma.fieldNote.findFirst({
    where: { vineyardId },
    orderBy: { weekOf: "desc" },
    select: fieldNoteSelect,
  });
  return row ? parseFieldNoteRow(row) : null;
}

/** N most-recent reports for a vineyard (admin history + the AI window). Scoped. */
export async function getRecentFieldNotes(
  vineyardId: string,
  n: number,
): Promise<ParsedFieldNote[]> {
  await requireVineyardAccess(vineyardId);
  const rows = await prisma.fieldNote.findMany({
    where: { vineyardId },
    orderBy: { weekOf: "desc" },
    take: Math.max(1, Math.min(n, 52)),
    select: fieldNoteSelect,
  });
  return rows.map(parseFieldNoteRow);
}

/** Fetch a single report by id, scope-checked. */
export async function getFieldNoteById(id: string): Promise<ParsedFieldNote | null> {
  const row = await prisma.fieldNote.findUnique({ where: { id }, select: fieldNoteSelect });
  if (!row) return null;
  await requireVineyardAccess(row.vineyardId);
  return parseFieldNoteRow(row);
}
