/**
 * The Phase-3 navigation flag.
 *
 * The handoff calls the IA rewrite "the most opinionated change" and recommends
 * shipping it behind a flag with a rollback path. Both code paths ship in the
 * same build, so reverting is an env change and a restart — no deploy, no revert
 * commit, no waiting on CI while the floor crew is mid-harvest.
 *
 * `NEXT_PUBLIC_` so the client bundle can read it without a server round-trip;
 * this gates presentation only, never data access or authorisation. Every
 * destination's real permission check stays exactly where it was.
 *
 * OFF (default) → today's 4-group / 31-entry sidebar, byte-identical.
 * ON            → the 3-group / 13-destination model in ./model.ts.
 */
export const NAV_V2_ENABLED = process.env.NEXT_PUBLIC_NAV_V2 === "1";
