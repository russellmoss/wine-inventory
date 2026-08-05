import "server-only";
import type { AssistantTool } from "../registry";
import { listWorkOrdersForAssistant, ASSISTANT_WO_DEFAULT_LIMIT, ASSISTANT_WO_MAX_LIMIT } from "@/lib/work-orders/data";
import { OPEN_STATUSES, ARCHIVE_STATUSES } from "@/lib/work-orders/archive-filters";

// Assistant work-order READ (feedback ticket cmsgbjgov, 2026-08-05).
//
// The assistant could CREATE work orders — propose_work_order, manage_work_order,
// issue_cap_management_wo — and had no way to read a single one back. Surfaced by the
// UNVERIFIED_FAILURE golden eval run against the live model: asked "did those work orders save?",
// it correctly answered "I don't have a read tool that lists work orders" and pointed at the page.
// Honest, and a dead end — and it was the exact question that ticket's user was asking, in the
// session where the assistant instead guessed "nothing got saved" about seven writes that had all
// committed.
//
// A DEDICATED READ TOOL, deliberately, rather than registering WorkOrder in `entities.ts` so db_find
// covers it. Every `EntityConfig` must supply `del`, and `isDeletable` is existence alone — so the
// moment WorkOrder joined that registry, db_delete would be able to delete work orders, straight
// past the governed lifecycle (status transitions, approval, the ledger operations tasks emit).
// Read access is what was missing; delete access is emphatically not.
//
// Pure read: no proposal, no confirmation, no mutation. Tenant scoping is the extended prisma client
// via runAsTenant inside `listWorkOrdersForAssistant`.

const STATUSES = [...OPEN_STATUSES, ...ARCHIVE_STATUSES];

type QueryWorkOrdersInput = {
  number?: unknown;
  status?: unknown;
  assignee?: unknown;
  search?: unknown;
  sinceDays?: unknown;
  includeFinalized?: unknown;
  limit?: unknown;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export const queryWorkOrdersTool: AssistantTool = {
  name: "query_work_orders",
  description:
    "Read WORK ORDERS back — the planned cellar work, whether it exists, and what state it is in. Call this for 'did that work order save?', 'what work orders did I create today', 'show me WO 83', 'what's open for Mike', 'anything overdue', 'is the bottling work order still a draft'. " +
    "USE IT TO VERIFY. If the user says a change did not appear, or asks whether something you proposed actually got created, look it up with this tool and report what you find — never guess, and never tell them it did not save without checking. You cannot see their screen; this tool is how you find out. " +
    "SCOPE: open work by default (DRAFT, ISSUED, IN_PROGRESS, PENDING_APPROVAL) — a work order you created and the user confirmed lands in DRAFT, so it IS covered by the default. Pass `includeFinalized: true` to also search APPROVED and CANCELLED, which you should do whenever the question is whether something EXISTS rather than what is outstanding. " +
    "FILTERING: `number` for an exact work-order number; `search` matches the title (and an exact number); `assignee` matches the assignee's email; `status` narrows to one state; `sinceDays` limits to work CREATED in the last N days (created, not due — freshly created drafts usually have no due date at all). Results are newest-created first and each carries a `path` you can link to. " +
    "This tool never changes anything. To create or edit a work order use propose_work_order or manage_work_order.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      number: { type: "integer", description: "An exact work-order number, e.g. 83 for 'WO #83'." },
      status: { type: "string", enum: STATUSES, description: "Narrow to one status. Omit for all open work." },
      assignee: { type: "string", description: "Assignee email (partial match), e.g. 'mike' or 'mike@demowinery.test'." },
      search: { type: "string", description: "Match the work-order title, e.g. 'bottling'. An exact number also matches." },
      sinceDays: { type: "number", description: "Only work orders CREATED in the last N days. Use for 'did the ones I made today save?' → 1." },
      includeFinalized: {
        type: "boolean",
        description: "Also include APPROVED and CANCELLED work orders. Set true when the question is whether something exists at all.",
      },
      limit: { type: "number", description: `Max rows to return. Default ${ASSISTANT_WO_DEFAULT_LIMIT}, max ${ASSISTANT_WO_MAX_LIMIT}.` },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryWorkOrdersInput;
    const tenantId = ctx.user.supportOrganizationId ?? ctx.user.activeOrganizationId;
    if (!tenantId) return { found: false, message: "No active winery in context." };

    const status = asString(input.status);
    if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
      return { found: false, message: `"${status}" is not a work-order status. Use one of: ${STATUSES.join(", ")}.` };
    }

    const number = asNumber(input.number);
    const sinceDays = asNumber(input.sinceDays);
    // `number` is exact, so it rides the same `q` clause the archive uses (title-or-exact-number) and
    // must ALSO lift the open-status floor — asking for WO #83 by number means "find #83", not "find
    // #83 if it happens to still be open".
    const askedForOne = number !== undefined;

    const { rows, total } = await listWorkOrdersForAssistant(
      tenantId,
      {
        q: askedForOne ? String(Math.trunc(number)) : asString(input.search),
        assigneeEmail: asString(input.assignee),
        status,
        includeFinalized: askedForOne ? true : input.includeFinalized === true,
        createdFrom:
          sinceDays !== undefined && sinceDays > 0
            ? new Date(Date.now() - sinceDays * 86_400_000).toISOString()
            : undefined,
      },
      asNumber(input.limit) ?? ASSISTANT_WO_DEFAULT_LIMIT,
    );

    if (!rows.length) {
      // Say what was actually searched. "None found" with no scope reads as "none exist", and this is
      // the tool whose whole job is to stop the assistant from over-claiming an absence.
      const scope = input.includeFinalized === true || askedForOne ? "any status" : "open work orders";
      return {
        found: false,
        searched: scope,
        message:
          `No ${scope === "any status" ? "work orders" : "open work orders"} matched. ` +
          `This searched ${scope}${sinceDays ? ` created in the last ${sinceDays} day(s)` : ""}` +
          `${input.includeFinalized === true || askedForOne ? "" : " — approved and cancelled work is excluded unless you pass includeFinalized"}.`,
      };
    }

    return {
      found: true,
      count: total,
      returned: rows.length,
      ...(total > rows.length ? { truncated: { returned: rows.length, matched: total } } : {}),
      workOrders: rows,
    };
  },
};
