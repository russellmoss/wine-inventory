import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionError } from "@/lib/action-error";

/**
 * `route-settle` — the `Response.json` sibling of `settleWithCapture` (ERRCAP-1).
 *
 * Both dependencies are mocked for the same reason `action-settle.test.ts` mocks them: `@sentry/nextjs`
 * needs an initialised client and `next/navigation` pulls Next's client router context.
 */

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const NEXT_CONTROL_FLOW = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith(NEXT_CONTROL_FLOW)) throw e;
  },
}));

const { routeError, cronError, cronAuthorized, cronUnauthorized } = await import("@/lib/route-settle");

const body = async (r: Response) => (await r.json()) as { ok?: boolean; error?: string; code?: string };

beforeEach(() => captureException.mockClear());

describe("routeError — browser-facing, REDACTS", () => {
  it("captures an unexpected error and does not put its message in the response", async () => {
    const boom = new Error('relation "feedback_attachment" violates foreign key "fa_ticket_fkey"');
    const res = routeError(boom, { route: "feedback.attachments", area: "feedback" });

    expect(res.status).toBe(500);
    const j = await body(res);
    // The whole point: a Prisma error names tables, columns and constraints. None of that is written
    // for a user, and the old code answered with it verbatim.
    expect(j.error).not.toContain("feedback_attachment");
    expect(j.error).not.toContain("foreign key");
    expect(j.error).toMatch(/something went wrong/i);
    expect(j.code).toBe("UNEXPECTED");

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = captureException.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(err).toBe(boom);
    expect(opts).toMatchObject({ tags: { route: "feedback.attachments", area: "feedback" } });
  });

  it("passes a deliberate ActionError through verbatim and does NOT page anyone", async () => {
    const res = routeError(new ActionError("Image must be 5 MB or smaller.", "VALIDATION"), {
      route: "inbox.attachments",
    });
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ ok: false, error: "Image must be 5 MB or smaller.", code: "VALIDATION" });
    // A user picking a 12 MB photo is not a bug. Capturing it would bury the real failures.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("maps each ActionError code to the status it implies", () => {
    const status = (code: ActionError["code"]) => routeError(new ActionError("x", code), { route: "t" }).status;
    expect(status("UNAUTHENTICATED")).toBe(401);
    expect(status("FORBIDDEN")).toBe(403);
    expect(status("VALIDATION")).toBe(400);
    expect(status("CONFLICT")).toBe(409);
    // Anything without a mapping — including UNEXPECTED — is a 500 rather than a silent 200.
    expect(status("UNEXPECTED")).toBe(500);
    expect(status("MUST_CHANGE_PASSWORD")).toBe(500);
  });

  it("captures a non-Error throw too (a string, a rejected object)", async () => {
    const res = routeError("just a string", { route: "ingest.documents" });
    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect((await body(res)).code).toBe("UNEXPECTED");
  });

  it("rethrows framework control flow instead of reporting it (REDIRECT-1)", () => {
    expect(() => routeError(new Error("NEXT_REDIRECT;replace;/login;307;"), { route: "t" })).toThrow(
      /NEXT_REDIRECT/,
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("cronError — operator-facing, KEEPS the message", () => {
  it("captures AND keeps the message, because the body lands in cron logs", async () => {
    const boom = new Error("Open-Meteo returned 503 for vineyard vy_123");
    const res = cronError(boom, { route: "cron.weather-poll" }, "Weather sweep failed.");

    expect(res.status).toBe(500);
    // Redacting here would remove the only diagnostic an on-call human gets. The missing piece was
    // never the redaction — it was the capture.
    expect(await body(res)).toEqual({ ok: false, error: "Open-Meteo returned 503 for vineyard vy_123" });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = captureException.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(err).toBe(boom);
    expect(opts).toMatchObject({ tags: { route: "cron.weather-poll", area: "cron" } });
  });

  it("falls back when the throw carried no message", async () => {
    const res = cronError({ nope: true }, { route: "cron.soil-sweep" }, "Soil sweep failed.");
    expect(await body(res)).toEqual({ ok: false, error: "Soil sweep failed." });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("rethrows framework control flow (REDIRECT-1)", () => {
    expect(() => cronError(new Error("NEXT_REDIRECT;replace;/login;307;"), { route: "cron.x" })).toThrow(
      /NEXT_REDIRECT/,
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("cronAuthorized — the one copy of the bearer gate", () => {
  const withSecret = (secret: string | undefined, authorization?: string) => {
    const prev = process.env.CRON_SECRET;
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    try {
      const headers = new Headers();
      if (authorization !== undefined) headers.set("authorization", authorization);
      return cronAuthorized(new Request("https://x.test/api/cron/weather-poll", { headers }));
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  };

  it("accepts the exact bearer token", () => {
    expect(withSecret("s3cret", "Bearer s3cret")).toBe(true);
  });

  it("FAILS CLOSED when CRON_SECRET is unset", () => {
    // An unset secret must not mean "let everyone in" — that would leave every sweep endpoint
    // unauthenticated in any environment that forgot the variable.
    expect(withSecret(undefined, "Bearer s3cret")).toBe(false);
    expect(withSecret(undefined)).toBe(false);
    expect(withSecret("", "Bearer ")).toBe(false);
  });

  it("rejects a missing, wrong, or wrongly-shaped header", () => {
    expect(withSecret("s3cret")).toBe(false);
    expect(withSecret("s3cret", "Bearer wrong!")).toBe(false);
    expect(withSecret("s3cret", "s3cret")).toBe(false); // no "Bearer " prefix
    expect(withSecret("s3cret", "bearer s3cret")).toBe(false); // case matters
  });

  it("does not throw on a length mismatch", () => {
    // timingSafeEqual THROWS on differing lengths, which is why the length pre-check is required and
    // not merely an optimisation — without it a short header 500s instead of 401ing.
    expect(() => withSecret("s3cret", "B")).not.toThrow();
    expect(withSecret("s3cret", "B")).toBe(false);
    expect(withSecret("s3cret", `Bearer ${"s3cret".repeat(10)}`)).toBe(false);
  });
});

describe("cronUnauthorized", () => {
  it("is a 401 with a body, not a bare status", async () => {
    const res = cronUnauthorized();
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: "Unauthorized." });
  });
});
