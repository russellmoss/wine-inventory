import "server-only";
import type { Prisma } from "@prisma/client";
import { emitNotificationTx } from "@/lib/inbox/notifications";
import type { EmitNotificationInput } from "@/lib/inbox/types";

// Plan 068 Unit 9 — the notification-CHANNEL seam. emitNotificationTx (the single choke point) is the
// in-app channel; this interface is where a future EMAIL channel drops in without touching any hook.
// v1 ships the in-app channel only; the email channel is a documented no-op stub (ADR 0005). Realtime
// push (SSE/websocket) is also deferred — the badge refreshes on navigation/router.refresh().

export interface NotificationChannel {
  readonly name: string;
  /** Deliver a notification. In-app writes the row (inside the caller's tx); other channels fan out. */
  deliver(tx: Prisma.TransactionClient, input: EmitNotificationInput): Promise<void>;
}

/** The v1 channel: persist the notification row (drives the inbox + unread badge). */
export const InAppChannel: NotificationChannel = {
  name: "in-app",
  deliver: (tx, input) => emitNotificationTx(tx, input),
};

/** Deferred: real external email. Intentionally a no-op so wiring it later is additive (no provider
 *  is configured in v1). When implemented, it reads recipientEmail + a rendered template and sends. */
export const EmailChannel: NotificationChannel = {
  name: "email",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deliver: async (_tx, _input) => {
    // TODO(plan-068-followup): send via the configured email provider. No-op until one is wired.
  },
};

/** The active channels for v1 (in-app only). Add EmailChannel here once a provider is configured. */
export const ACTIVE_CHANNELS: NotificationChannel[] = [InAppChannel];
