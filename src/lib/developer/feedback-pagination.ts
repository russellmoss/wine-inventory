export type DeveloperFeedbackSourceType = "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";

export type DeveloperFeedbackCursor = {
  createdAt: string;
  id: string;
};

type CursorPayload = DeveloperFeedbackCursor & { v: 1 };

export class DeveloperFeedbackCursorError extends Error {
  constructor() {
    super("Invalid feedback cursor.");
    this.name = "DeveloperFeedbackCursorError";
  }
}

function validCursor(cursor: DeveloperFeedbackCursor): boolean {
  if (!cursor.id || cursor.id.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(cursor.id)) return false;
  if (cursor.createdAt.length > 40) return false;
  const parsed = new Date(cursor.createdAt);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === cursor.createdAt;
}

export function encodeDeveloperFeedbackCursor(cursor: DeveloperFeedbackCursor): string {
  if (!validCursor(cursor)) throw new DeveloperFeedbackCursorError();
  const payload: CursorPayload = { v: 1, createdAt: cursor.createdAt, id: cursor.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeDeveloperFeedbackCursor(value?: string | null): DeveloperFeedbackCursor | null {
  if (value === undefined || value === null || value === "") return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new DeveloperFeedbackCursorError();
  }

  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new DeveloperFeedbackCursorError();
    }
    const payload = parsed as Record<string, unknown>;
    const keys = Object.keys(payload).sort();
    if (
      keys.join(",") !== "createdAt,id,v" ||
      payload.v !== 1 ||
      typeof payload.createdAt !== "string" ||
      typeof payload.id !== "string"
    ) {
      throw new DeveloperFeedbackCursorError();
    }
    const cursor = { createdAt: payload.createdAt, id: payload.id };
    if (!validCursor(cursor) || encodeDeveloperFeedbackCursor(cursor) !== value) {
      throw new DeveloperFeedbackCursorError();
    }
    return cursor;
  } catch (error) {
    if (error instanceof DeveloperFeedbackCursorError) throw error;
    throw new DeveloperFeedbackCursorError();
  }
}

export function developerFeedbackCursorWhere(cursor: DeveloperFeedbackCursor | null) {
  if (!cursor) return {};
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}

type MergeableFeedbackRow = {
  sourceType: DeveloperFeedbackSourceType;
  id: string;
  createdAt: string;
};

function compareRows(a: MergeableFeedbackRow, b: MergeableFeedbackRow): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return a.sourceType.localeCompare(b.sourceType);
}

export function mergeDeveloperFeedbackPage<T extends MergeableFeedbackRow>(input: {
  assistantRows: T[];
  ticketRows: T[];
  pageSize: number;
  assistantCursor?: string | null;
  ticketCursor?: string | null;
}): {
  items: T[];
  nextAssistantCursor: string | null;
  nextTicketCursor: string | null;
  hasMore: boolean;
} {
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    throw new RangeError("Feedback page size must be an integer from 1 to 100.");
  }

  const seen = new Set<string>();
  const merged = [...input.assistantRows, ...input.ticketRows]
    .sort(compareRows)
    .filter((row) => {
      const key = `${row.sourceType}:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const items = merged.slice(0, input.pageSize);

  const lastAssistant = items.findLast((row) => row.sourceType === "ASSISTANT_FEEDBACK");
  const lastTicket = items.findLast((row) => row.sourceType === "FEEDBACK_TICKET");
  const emittedAssistantCount = items.filter(
    (row) => row.sourceType === "ASSISTANT_FEEDBACK",
  ).length;
  const emittedTicketCount = items.length - emittedAssistantCount;

  return {
    items,
    nextAssistantCursor: lastAssistant
      ? encodeDeveloperFeedbackCursor({ createdAt: lastAssistant.createdAt, id: lastAssistant.id })
      : (input.assistantCursor ?? null),
    nextTicketCursor: lastTicket
      ? encodeDeveloperFeedbackCursor({ createdAt: lastTicket.createdAt, id: lastTicket.id })
      : (input.ticketCursor ?? null),
    hasMore:
      input.assistantRows.length > emittedAssistantCount ||
      input.ticketRows.length > emittedTicketCount,
  };
}
