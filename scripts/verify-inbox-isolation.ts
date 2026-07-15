/**
 * Plan 068 Unit 9 — INBOX-1 EXIT PROOF: per-user isolation on the inbox tables, exercised AS the
 * non-owner app_rls role.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-inbox-isolation.ts
 *
 * The tenant (cross-org) dimension is already auto-covered by verify:tenant-isolation (every non-global
 * table gets ENABLE+FORCE+tenant_isolation). THIS guard proves the PER-USER dimension added in Unit 1b:
 *   - a notification / DM is readable ONLY by its owner (recipient / thread participant), even inside
 *     the same tenant, gated on app.user_id;
 *   - but a same-tenant actor CAN insert a notification FOR another user (the emit path);
 *   - unset app.user_id fails closed (zero rows).
 * Plus a static check that the inbox reads carry the owner predicate (defense in depth with the RLS).
 *
 * Two clients: owner = DATABASE_URL_UNPOOLED (BYPASSRLS, setup/teardown); app = DATABASE_URL_APP
 * (app_rls, NOBYPASSRLS, under test). All fixtures live in the Demo Winery sandbox and are deleted after.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TENANT = "org_demo_winery";
const U_A = "iso_inbox_user_a";
const U_B = "iso_inbox_user_b";
const U_C = "iso_inbox_user_c";
const N_SETUP = "iso_inbox_notif_setup"; // recipient B, created by owner
const N_APP = "iso_inbox_notif_app"; // recipient B, INSERTED via app as A (crux)
const THREAD = "iso_inbox_thread_ab";
const MSG = "iso_inbox_msg_ab";

const OWNER_URL = process.env.DATABASE_URL_UNPOOLED;
const APP_URL = process.env.DATABASE_URL_APP;
if (!OWNER_URL) throw new Error("DATABASE_URL_UNPOOLED (owner) required.");
if (!APP_URL) throw new Error("DATABASE_URL_APP (app_rls) required.");

const owner = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
const app = new PrismaClient({ datasources: { db: { url: APP_URL } } });

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}

const TX_MS = Number(process.env.VERIFY_TX_TIMEOUT_MS) || 120_000;
/** Run fn as app_rls with BOTH GUCs set for the tx (mirrors the app extension, Unit 1b). */
function asUser<T>(tenantId: string, userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return app.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    },
    { timeout: TX_MS, maxWait: TX_MS },
  );
}

async function main() {
  const attrs = await app.$queryRaw<{ current_user: string; rolbypassrls: boolean }[]>`
    SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`;
  check("app connects as a NOBYPASSRLS role", !!attrs[0] && !attrs[0].rolbypassrls, `current_user=${attrs[0]?.current_user}`);

  // ── Setup (owner, bypasses RLS) ──
  await owner.organization.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: "Demo Winery", slug: "demo-winery" } });
  for (const [id, email] of [[U_A, "iso-a@demo.test"], [U_B, "iso-b@demo.test"], [U_C, "iso-c@demo.test"]] as const) {
    await owner.user.upsert({ where: { id }, update: {}, create: { id, name: id, email, emailVerified: true } });
    await owner.member.upsert({
      where: { organizationId_userId: { organizationId: TENANT, userId: id } },
      update: {},
      create: { id: `${id}_m`, organizationId: TENANT, userId: id, role: "member" },
    });
  }
  const [uaId, ubId] = U_A < U_B ? [U_A, U_B] : [U_B, U_A]; // sorted pair for the CHECK
  await owner.inboxNotification.create({
    data: { id: N_SETUP, tenantId: TENANT, recipientUserId: U_B, recipientEmail: "iso-b@demo.test", category: "SYSTEM", kind: "TICKET_STATUS", title: "iso", snippet: "iso", sourceType: "qa", sourceId: "qa" },
  });
  await owner.directMessageThread.upsert({
    where: { id: THREAD },
    update: {},
    create: { id: THREAD, tenantId: TENANT, createdByUserId: uaId, userAId: uaId, userAEmail: `${uaId}@demo.test`, userBId: ubId, userBEmail: `${ubId}@demo.test`, lastMessageAt: new Date(0) },
  });
  await owner.directMessage.upsert({
    where: { id: MSG },
    update: {},
    create: { id: MSG, tenantId: TENANT, threadId: THREAD, senderUserId: U_A, senderEmail: "iso-a@demo.test", body: "iso body", createdAt: new Date(0) },
  });

  try {
    // ── Crux: a same-tenant actor (A) CAN insert a notification FOR another user (B) via app_rls. ──
    let insertOk = true;
    try {
      await asUser(TENANT, U_A, (tx) =>
        tx.inboxNotification.createMany({
          data: [{ id: N_APP, tenantId: TENANT, recipientUserId: U_B, recipientEmail: "iso-b@demo.test", category: "SYSTEM", kind: "TICKET_STATUS", title: "iso", snippet: "iso", sourceType: "qa", sourceId: "qa" }],
        }),
      );
    } catch {
      insertOk = false;
    }
    check("a same-tenant actor may INSERT a notification for another user (emit path)", insertOk);

    // ── Owner-only reads on inbox_notification ──
    const aSees = await asUser(TENANT, U_A, (tx) => tx.inboxNotification.findMany({ where: { id: { in: [N_SETUP, N_APP] } }, select: { id: true } }));
    check("user A CANNOT read user B's notifications (same tenant)", aSees.length === 0, `saw ${aSees.length}`);
    const bSees = await asUser(TENANT, U_B, (tx) => tx.inboxNotification.findMany({ where: { id: { in: [N_SETUP, N_APP] } }, select: { id: true } }));
    check("user B (owner) CAN read both notifications", bSees.length === 2, `saw ${bSees.length}`);
    const noneSees = await asUser(TENANT, "", (tx) => tx.inboxNotification.findMany({ where: { id: { in: [N_SETUP, N_APP] } }, select: { id: true } }));
    check("unset app.user_id reads zero notifications (fail-closed)", noneSees.length === 0, `saw ${noneSees.length}`);

    // ── Participant-only reads on DM thread + message ──
    const cThread = await asUser(TENANT, U_C, (tx) => tx.directMessageThread.findMany({ where: { id: THREAD }, select: { id: true } }));
    check("a non-participant (C) CANNOT read the A↔B thread", cThread.length === 0, `saw ${cThread.length}`);
    const aThread = await asUser(TENANT, U_A, (tx) => tx.directMessageThread.findMany({ where: { id: THREAD }, select: { id: true } }));
    check("participant A CAN read the thread", aThread.length === 1);
    const cMsg = await asUser(TENANT, U_C, (tx) => tx.directMessage.findMany({ where: { id: MSG }, select: { id: true } }));
    check("a non-participant (C) CANNOT read the thread's messages", cMsg.length === 0, `saw ${cMsg.length}`);
    const bMsg = await asUser(TENANT, U_B, (tx) => tx.directMessage.findMany({ where: { id: MSG }, select: { id: true } }));
    check("participant B CAN read the thread's messages", bMsg.length === 1);

    // ── Static (defense in depth): the inbox reads carry the owner predicate. ──
    const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
    const notifSrc = readFileSync(join(repo, "src/lib/inbox/notifications.ts"), "utf8");
    check("notifications core reads constrain by recipientUserId", /recipientUserId:\s*userId/.test(notifSrc));
    const dmSrc = readFileSync(join(repo, "src/lib/inbox/direct-messages.ts"), "utf8");
    check("DM reads are wrapped with the acting userId (per-user RLS applies)", /\{\s*userId\s*\}/.test(dmSrc));
  } finally {
    // ── Teardown (owner) ──
    await owner.directMessage.deleteMany({ where: { id: MSG } });
    await owner.directMessageThread.deleteMany({ where: { id: THREAD } });
    await owner.inboxNotification.deleteMany({ where: { id: { in: [N_SETUP, N_APP] } } });
    await owner.member.deleteMany({ where: { userId: { in: [U_A, U_B, U_C] } } });
    await owner.user.deleteMany({ where: { id: { in: [U_A, U_B, U_C] } } });
    await app.$disconnect();
    await owner.$disconnect();
  }

  console.log(failures === 0 ? "\nALL INBOX ISOLATION CHECKS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
