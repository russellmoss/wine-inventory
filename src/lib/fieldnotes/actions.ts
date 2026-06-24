"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { action, getActionUser, ActionError } from "@/lib/actions";
import { canManagerAccessVineyard } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { isValidWeekOf, parseISODateUTC } from "@/lib/fieldnotes/week";
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
 * Create this week's report for a vineyard. Manager-scoped (admins any vineyard).
 * Validates weekOf (Friday, not future), the JSON payloads, and that every
 * current block has a status. One report per vineyard per week (unique).
 */
export const createFieldNote = action(
  async ({ actor }, input: CreateFieldNoteInput): Promise<{ id: string }> => {
    const { vineyardId } = input;
    if (!vineyardId) throw new ActionError("Missing vineyard.");
    await requireVineyardAccess(vineyardId);

    if (!isValidWeekOf(input.weekOf)) {
      throw new ActionError("Pick a valid report week (a Friday, not in the future).");
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

    try {
      const note = await prisma.$transaction(async (tx) => {
        const created = await tx.fieldNote.create({
          data: {
            vineyardId,
            userId: actor.actorUserId,
            userEmail: actor.actorEmail,
            weekOf,
            weatherData: weatherData as Prisma.InputJsonValue,
            spraysApplied: spraysApplied as unknown as Prisma.InputJsonValue,
            fertilizersApplied: fertilizersApplied as unknown as Prisma.InputJsonValue,
            blockLevelStatuses: cleanStatuses as Prisma.InputJsonValue,
            generalNotes: input.generalNotes?.trim() || null,
            schemaVersion: SCHEMA_VERSION,
            aiSummaryStatus: "PENDING",
          },
          select: { id: true },
        });
        await writeAudit(tx, {
          ...actor,
          action: "FIELD_NOTE_CREATED",
          entityType: "FieldNote",
          entityId: created.id,
          summary: `Logged field note for week of ${input.weekOf}`,
        });
        return created;
      });
      revalidatePath(PATH);
      return { id: note.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ActionError("A report has already been submitted for this week.", "CONFLICT");
      }
      throw e;
    }
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
