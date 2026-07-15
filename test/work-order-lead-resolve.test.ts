import { describe, expect, it } from "vitest";
import { resolveCreateLead, resolveBackfillLead } from "@/lib/work-orders/lead-resolve";
import { ActionError } from "@/lib/action-error";

describe("resolveCreateLead (Plan 069 — mandatory Lead)", () => {
  const actor = { actorUserId: "actor-1", actorEmail: "mike@bhutanwine.com" };

  it("passes an explicit email Lead through untouched", () => {
    expect(resolveCreateLead({ assigneeEmail: "lead@x.com" }, actor)).toEqual({
      assigneeId: null,
      assigneeEmail: "lead@x.com",
    });
  });

  it("keeps the assigneeId when an explicit id+email Lead is given", () => {
    expect(resolveCreateLead({ assigneeId: "u9", assigneeEmail: "lead@x.com" }, actor)).toEqual({
      assigneeId: "u9",
      assigneeEmail: "lead@x.com",
    });
  });

  it("defaults the Lead to the creating actor when none is provided", () => {
    expect(resolveCreateLead({}, actor)).toEqual({ assigneeId: "actor-1", assigneeEmail: "mike@bhutanwine.com" });
  });

  it("treats a blank/whitespace email as no Lead and falls back to the actor", () => {
    expect(resolveCreateLead({ assigneeEmail: "   " }, actor)).toEqual({
      assigneeId: "actor-1",
      assigneeEmail: "mike@bhutanwine.com",
    });
  });

  it("throws when there is neither an explicit Lead nor a usable actor email", () => {
    expect(() => resolveCreateLead({}, { actorUserId: null, actorEmail: "" })).toThrow(ActionError);
  });
});

describe("resolveBackfillLead (Plan 069 — smart backfill)", () => {
  it("uses the single distinct task assignee (the WO #27 case)", () => {
    expect(
      resolveBackfillLead({
        taskAssignees: [{ id: "russell", email: "russellmoss87@gmail.com" }],
        issuedBy: { id: "mike", email: "mike@bhutanwine.com" },
        fallbackAdmin: null,
      }),
    ).toEqual({ assigneeId: "russell", assigneeEmail: "russellmoss87@gmail.com" });
  });

  it("collapses duplicate task-assignee rows to the one distinct person", () => {
    expect(
      resolveBackfillLead({
        taskAssignees: [
          { id: "russell", email: "russellmoss87@gmail.com" },
          { id: "russell", email: "russellmoss87@gmail.com" },
        ],
        issuedBy: null,
        fallbackAdmin: null,
      }),
    ).toEqual({ assigneeId: "russell", assigneeEmail: "russellmoss87@gmail.com" });
  });

  it("falls back to the issuer when tasks name more than one distinct assignee", () => {
    expect(
      resolveBackfillLead({
        taskAssignees: [
          { id: "a", email: "a@x.com" },
          { id: "b", email: "b@x.com" },
        ],
        issuedBy: { id: "mike", email: "mike@bhutanwine.com" },
        fallbackAdmin: { id: "admin", email: "admin@x.com" },
      }),
    ).toEqual({ assigneeId: "mike", assigneeEmail: "mike@bhutanwine.com" });
  });

  it("falls back to the issuer when there are no task assignees", () => {
    expect(
      resolveBackfillLead({
        taskAssignees: [],
        issuedBy: { id: "mike", email: "mike@bhutanwine.com" },
        fallbackAdmin: { id: "admin", email: "admin@x.com" },
      }),
    ).toEqual({ assigneeId: "mike", assigneeEmail: "mike@bhutanwine.com" });
  });

  it("falls back to the admin when there is no task assignee and no issuer", () => {
    expect(
      resolveBackfillLead({
        taskAssignees: [{ id: null, email: null }],
        issuedBy: null,
        fallbackAdmin: { id: "admin", email: "admin@x.com" },
      }),
    ).toEqual({ assigneeId: "admin", assigneeEmail: "admin@x.com" });
  });

  it("returns null when there is no signal at all (caller logs for manual review)", () => {
    expect(
      resolveBackfillLead({ taskAssignees: [], issuedBy: null, fallbackAdmin: null }),
    ).toBeNull();
  });
});
