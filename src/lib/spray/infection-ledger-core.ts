// Spray Intelligence S5a — the latent-infection ledger write core. Append-only: open, resolve,
// correct and reverse are all INSERTs, never an UPDATE. Script-safe (no "use server", no
// next/cache — the src/lib/ledger/reverse.ts pattern), so verify scripts call the same path the
// app does.
//
// DELIBERATELY NO `*Core`-suffixed exports, exactly as units-core.ts documents for itself. A
// `*Core` export in a `*-core.ts` file enters the verify:ai-native matrix and must then be
// reachable from a registered assistant tool. S5a ships NO assistant write path for infection
// events — Unit 7's `query_spray_decision` is read-only and hard-refusing — so claiming coverage
// here would be coverage in name only. The capability that IS assistant-facing is the read
// composition (powdery-read.ts), and that is where the `Core` export lives.
//
// IDEMPOTENCY (council C5). withWriteRetry re-runs the WHOLE transaction on a 40001 serialization
// failure, so an unguarded insert path double-appends. Following S3a's resolution (council C8),
// idempotency is a RE-READ rather than a swallowed constraint violation: on a commandId conflict we
// re-read by commandId and return the winner when the requestHash matches; a same-commandId,
// DIFFERENT-payload submission is rejected loudly rather than silently returning the wrong row.

import "server-only";
import { Prisma } from "@prisma/client";
import type { InfectionEvidenceSource, InfectionHostOrgan, InfectionPathogen, InfectionResolutionKind } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { withWriteRetry } from "@/lib/db/write-retry";
import { writeAudit } from "@/lib/audit";
import { computeRequestHash } from "./record-pure";
import { evaluateResolution, projectTransitions } from "./infection-resolution";

export class InfectionLedgerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "VALIDATION"
      | "EVENT_NOT_FOUND"
      | "EVENT_NOT_OPEN"
      | "COMMAND_REPLAY_MISMATCH" = "VALIDATION",
  ) {
    super(message);
    this.name = "InfectionLedgerError";
  }
}

export interface InfectionActor {
  userId: string | null;
  email: string;
}

export interface OpenInfectionEventInput {
  blockId: string;
  pathogen: InfectionPathogen;
  hostOrgan: InfectionHostOrgan;
  /** ISO YYYY-MM-DD. */
  infectionOccurredOn: string;
  evidenceSource: InfectionEvidenceSource;
  /** Opaque id of the scouting observation / report this came from. Never personal data (D19). */
  observationRef?: string | null;
  /**
   * FIXED_WINDOW projects both transitions from the pathogen's latent bounds. UNKNOWN is a
   * first-class arm and projects nothing — it is NOT a failure to compute (rule §3.3).
   */
  resolutionKind?: InfectionResolutionKind;
  /** Deterministic idempotency key. Required — an append-only ledger without one duplicates on retry. */
  commandId: string;
}

export interface AppendResult {
  logicalEventId: string;
  rowId: string;
  seq: number;
  /** True when this call returned an existing row via the commandId re-read path. */
  idempotentReplay: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new InfectionLedgerError(`${field} must be an ISO YYYY-MM-DD date (got ${JSON.stringify(value)}).`);
  }
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Re-read the winner of a commandId race and decide replay-vs-mismatch. Shared by every command. */
async function resolveReplay(commandId: string, requestHash: string): Promise<AppendResult> {
  const existing = await runInTenantTx((tx) =>
    tx.latentInfectionEvent.findFirst({
      where: { commandId },
      select: { id: true, logicalEventId: true, seq: true, requestHash: true },
    }),
  );
  if (!existing) {
    throw new InfectionLedgerError(
      `commandId ${commandId} conflicted but no row could be re-read — the ledger is in an unexpected state.`,
      "VALIDATION",
    );
  }
  if (existing.requestHash !== requestHash) {
    throw new InfectionLedgerError(
      `commandId ${commandId} was already used for a DIFFERENT payload — refusing the replay (council C5).`,
      "COMMAND_REPLAY_MISMATCH",
    );
  }
  return { logicalEventId: existing.logicalEventId, rowId: existing.id, seq: existing.seq, idempotentReplay: true };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Open a new latent-infection event — the first append of a new stream (seq 1).
 *
 * The projected transitions take OPPOSITE bounds by design (KD-4): `infectiousExpectedAt` from the
 * SHORTEST plausible latent period, the expiry from the LONGEST. See infection-resolution.ts.
 */
export async function openInfectionEvent(input: OpenInfectionEventInput, actor: InfectionActor): Promise<AppendResult> {
  requireIsoDate(input.infectionOccurredOn, "infectionOccurredOn");
  if (!input.commandId) throw new InfectionLedgerError("commandId is required — an append-only ledger without one duplicates on retry.");

  const resolutionKind: InfectionResolutionKind = input.resolutionKind ?? "FIXED_WINDOW";
  const projection = projectTransitions({
    pathogen: input.pathogen,
    hostOrgan: input.hostOrgan,
    resolutionKind,
    infectionOccurredOn: input.infectionOccurredOn,
  });

  const requestHash = computeRequestHash({ op: "open", ...input, resolutionKind });

  try {
    return await withWriteRetry(
      () =>
        runInTenantTx(
          async (tx) => {
            const block = await tx.vineyardBlock.findFirst({ where: { id: input.blockId }, select: { id: true } });
            if (!block) throw new InfectionLedgerError(`Block ${input.blockId} not found in this tenant.`, "EVENT_NOT_FOUND");

            const logicalEventId = `lie_${input.blockId}_${input.pathogen}_${input.hostOrgan}_${input.infectionOccurredOn}_${input.commandId}`;

            const row = await tx.latentInfectionEvent.create({
              data: {
                logicalEventId,
                seq: 1,
                blockId: input.blockId,
                pathogen: input.pathogen,
                hostOrgan: input.hostOrgan,
                status: "OPEN",
                resolutionKind,
                infectionOccurredOn: toDate(input.infectionOccurredOn),
                symptomExpectedAt: projection.symptomExpectedAt ? toDate(projection.symptomExpectedAt) : null,
                symptomProjectionKind: projection.symptomProjectionKind,
                symptomBasis: projection.symptomBasis,
                infectiousExpectedAt: projection.infectiousExpectedAt ? toDate(projection.infectiousExpectedAt) : null,
                infectiousProjectionKind: projection.infectiousProjectionKind,
                infectiousBasis: projection.infectiousBasis,
                latentShortDays: projection.latentShortDays,
                latentLongDays: projection.latentLongDays,
                expiresOn: projection.expiresOn ? toDate(projection.expiresOn) : null,
                evidenceSource: input.evidenceSource,
                observationRef: input.observationRef ?? null,
                commandId: input.commandId,
                requestHash,
                enteredById: actor.userId,
                enteredByEmail: actor.email,
              },
              select: { id: true, logicalEventId: true, seq: true },
            });

            await writeAudit(tx, {
              actorUserId: actor.userId,
              actorEmail: actor.email,
              action: "CREATE",
              entityType: "latent_infection_event",
              entityId: row.id,
              summary: `Opened a latent ${input.pathogen} infection event on ${input.hostOrgan.toLowerCase()} tissue, infection dated ${input.infectionOccurredOn}.`,
            });

            return { logicalEventId: row.logicalEventId, rowId: row.id, seq: row.seq, idempotentReplay: false };
          },
          { isolationLevel: "Serializable" },
        ),
      5,
      "latent-infection-open",
    );
  } catch (e) {
    if (isUniqueViolation(e)) return resolveReplay(input.commandId, requestHash);
    throw e;
  }
}

/** The current state of a stream: the latest row, by seq. Never a lookup by pathogen/organ (C4). */
export async function readCurrentEvent(logicalEventId: string) {
  return runInTenantTx((tx) =>
    tx.latentInfectionEvent.findFirst({
      where: { logicalEventId },
      orderBy: { seq: "desc" },
    }),
  );
}

export interface CloseInfectionEventInput {
  logicalEventId: string;
  /** ISO YYYY-MM-DD — site-local today, injected by the caller. Never new Date() in a core. */
  today: string;
  /**
   * ERADICATED closes the event because a kickback spray killed it in planta (council C9). In S5a
   * this is reachable ONLY by an attributed human override: the FRAC-group kickback lookup belongs
   * with S2's resistance data and S7a, and faking it here would be inventing a chemistry claim.
   */
  eradicated?: boolean;
  note?: string | null;
  commandId: string;
}

/**
 * Append a CLOSED row to an open stream.
 *
 * KD-5 lives one level down, in `evaluateResolution`: a clean scouting pass is accepted as context
 * and deliberately does NOT close the event. There is no parameter here that lets a caller close an
 * event because somebody looked and saw nothing, and that absence is the point.
 */
export async function closeInfectionEvent(input: CloseInfectionEventInput, actor: InfectionActor): Promise<AppendResult> {
  requireIsoDate(input.today, "today");
  if (!input.commandId) throw new InfectionLedgerError("commandId is required.");

  const requestHash = computeRequestHash({ op: "close", ...input });

  try {
    return await withWriteRetry(
      () =>
        runInTenantTx(
          async (tx) => {
            const current = await tx.latentInfectionEvent.findFirst({
              where: { logicalEventId: input.logicalEventId },
              orderBy: { seq: "desc" },
            });
            if (!current) throw new InfectionLedgerError(`No infection event stream ${input.logicalEventId}.`, "EVENT_NOT_FOUND");
            if (current.status !== "OPEN") {
              throw new InfectionLedgerError(`Event ${input.logicalEventId} is already ${current.status}.`, "EVENT_NOT_OPEN");
            }

            const eradicated = input.eradicated === true;
            if (!eradicated) {
              const verdict = evaluateResolution({
                resolutionKind: current.resolutionKind,
                expiresOn: toIso(current.expiresOn),
                today: input.today,
              });
              if (!verdict.close) {
                throw new InfectionLedgerError(`Refusing to close ${input.logicalEventId}: ${verdict.reason}`, "EVENT_NOT_OPEN");
              }
            }

            const row = await tx.latentInfectionEvent.create({
              data: {
                logicalEventId: current.logicalEventId,
                seq: current.seq + 1,
                blockId: current.blockId,
                pathogen: current.pathogen,
                hostOrgan: current.hostOrgan,
                status: "CLOSED",
                // An eradicated event stops projecting: the pathogen is dead in planta, so continuing
                // to project it infectious would prompt another useless application and drive the
                // exact resistance pressure S7a exists to manage (council C9).
                resolutionKind: eradicated ? "ERADICATED" : current.resolutionKind,
                infectionOccurredOn: current.infectionOccurredOn,
                symptomExpectedAt: eradicated ? null : current.symptomExpectedAt,
                symptomProjectionKind: eradicated ? "NOT_APPLICABLE" : current.symptomProjectionKind,
                symptomBasis: current.symptomBasis,
                infectiousExpectedAt: eradicated ? null : current.infectiousExpectedAt,
                infectiousProjectionKind: eradicated ? "NOT_APPLICABLE" : current.infectiousProjectionKind,
                infectiousBasis: current.infectiousBasis,
                latentShortDays: eradicated ? null : current.latentShortDays,
                latentLongDays: eradicated ? null : current.latentLongDays,
                expiresOn: eradicated ? null : current.expiresOn,
                resolvedOn: toDate(input.today),
                resolutionNote:
                  input.note ??
                  (eradicated
                    ? "Closed as ERADICATED — an eradicant/kickback application killed the infection in planta before it became infectious."
                    : "The latent window closed on its LONGEST plausible bound without confirmation."),
                supersedesRowId: current.id,
                evidenceSource: current.evidenceSource,
                observationRef: current.observationRef,
                commandId: input.commandId,
                requestHash,
                enteredById: actor.userId,
                enteredByEmail: actor.email,
              },
              select: { id: true, logicalEventId: true, seq: true },
            });

            await writeAudit(tx, {
              actorUserId: actor.userId,
              actorEmail: actor.email,
              action: "UPDATE",
              entityType: "latent_infection_event",
              entityId: row.id,
              summary: `Closed latent ${current.pathogen} infection event${eradicated ? " as ERADICATED (kickback application)" : ""}.`,
            });

            return { logicalEventId: row.logicalEventId, rowId: row.id, seq: row.seq, idempotentReplay: false };
          },
          { isolationLevel: "Serializable" },
        ),
      5,
      "latent-infection-close",
    );
  } catch (e) {
    if (isUniqueViolation(e)) return resolveReplay(input.commandId, requestHash);
    throw e;
  }
}

export interface ReverseInfectionEventInput {
  logicalEventId: string;
  reason: string;
  commandId: string;
}

/**
 * Withdraw an event that should never have been recorded — a VOID append, never a delete.
 * A void is a successor row (the SPRAY-1 correction-as-event posture); the original stays readable
 * because what somebody believed on the day is part of the record.
 */
export async function reverseInfectionEvent(input: ReverseInfectionEventInput, actor: InfectionActor): Promise<AppendResult> {
  if (!input.reason?.trim()) throw new InfectionLedgerError("A reversal must carry a reason — an unexplained void is not auditable.");
  if (!input.commandId) throw new InfectionLedgerError("commandId is required.");

  const requestHash = computeRequestHash({ op: "reverse", ...input });

  try {
    return await withWriteRetry(
      () =>
        runInTenantTx(
          async (tx) => {
            const current = await tx.latentInfectionEvent.findFirst({
              where: { logicalEventId: input.logicalEventId },
              orderBy: { seq: "desc" },
            });
            if (!current) throw new InfectionLedgerError(`No infection event stream ${input.logicalEventId}.`, "EVENT_NOT_FOUND");

            const row = await tx.latentInfectionEvent.create({
              data: {
                logicalEventId: current.logicalEventId,
                seq: current.seq + 1,
                blockId: current.blockId,
                pathogen: current.pathogen,
                hostOrgan: current.hostOrgan,
                status: "VOID",
                resolutionKind: "UNKNOWN",
                infectionOccurredOn: current.infectionOccurredOn,
                symptomExpectedAt: null,
                symptomProjectionKind: "NOT_APPLICABLE",
                symptomBasis: null,
                infectiousExpectedAt: null,
                infectiousProjectionKind: "NOT_APPLICABLE",
                infectiousBasis: null,
                latentShortDays: null,
                latentLongDays: null,
                expiresOn: null,
                resolutionNote: input.reason,
                reversesRowId: current.id,
                evidenceSource: current.evidenceSource,
                observationRef: current.observationRef,
                commandId: input.commandId,
                requestHash,
                enteredById: actor.userId,
                enteredByEmail: actor.email,
              },
              select: { id: true, logicalEventId: true, seq: true },
            });

            await writeAudit(tx, {
              actorUserId: actor.userId,
              actorEmail: actor.email,
              action: "DELETE",
              entityType: "latent_infection_event",
              entityId: row.id,
              summary: `Voided latent ${current.pathogen} infection event: ${input.reason}`,
            });

            return { logicalEventId: row.logicalEventId, rowId: row.id, seq: row.seq, idempotentReplay: false };
          },
          { isolationLevel: "Serializable" },
        ),
      5,
      "latent-infection-reverse",
    );
  } catch (e) {
    if (isUniqueViolation(e)) return resolveReplay(input.commandId, requestHash);
    throw e;
  }
}
