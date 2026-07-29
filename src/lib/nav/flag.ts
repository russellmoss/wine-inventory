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
 * **Default flipped to ON, 2026-07-29 (owner).** Plan 104 finished the second level
 * of the IA, so the v2 nav is now the shipping nav: 4 groups (Today · The vineyards ·
 * The wine · The business), 16 destinations, sub-navigation on the hubs, and Ctrl-K
 * covering every one of them.
 *
 * The test is `!== "0"`, NOT `=== "1"`, and that is the whole point. The rollback
 * property this flag was built for is preserved exactly: set `NEXT_PUBLIC_NAV_V2=0`
 * and redeploy to get the legacy 31-entry sidebar back. Both code paths still ship in
 * the same build, so backing out stays an env change — no revert commit while the
 * floor crew is mid-harvest.
 *
 * ON (default) → the 4-group / 16-destination model in ./model.ts.
 * `=0`         → today's 4-group / 31-entry legacy sidebar, byte-identical.
 */
export const NAV_V2_ENABLED = process.env.NEXT_PUBLIC_NAV_V2 !== "0";
