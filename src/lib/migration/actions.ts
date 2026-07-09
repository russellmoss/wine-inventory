"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import {
  acceptReconciliationItemCore,
  confirmMigrationEntityMappingCore,
  confirmMigrationFieldMappingCore,
  createMigrationBatchCore,
  discardMigrationBatchCore,
  runMigrationPreflightCore,
  signOffMigrationBatchCore,
} from "./batch";
import { publishMigrationBatchCore } from "./publish";

function refreshMigration() {
  revalidatePath("/migration");
}

export const createMigrationBatchAction = adminAction(async ({ actor }, input?: { cutoverAt?: Date }) => {
  const result = await createMigrationBatchCore(actor, input);
  refreshMigration();
  return result;
});

export const confirmMigrationFieldMappingAction = adminAction(async ({ actor }, input: Parameters<typeof confirmMigrationFieldMappingCore>[1]) => {
  const result = await confirmMigrationFieldMappingCore(actor, input);
  refreshMigration();
  return result;
});

export const confirmMigrationEntityMappingAction = adminAction(async ({ actor }, input: Parameters<typeof confirmMigrationEntityMappingCore>[1]) => {
  const result = await confirmMigrationEntityMappingCore(actor, input);
  refreshMigration();
  return result;
});

export const runMigrationPreflightAction = adminAction(async (_ctx, batchId: string) => {
  const result = await runMigrationPreflightCore(batchId);
  refreshMigration();
  return result;
});

export const acceptReconciliationItemAction = adminAction(async ({ actor }, input: { itemId: string; reason: string }) => {
  const result = await acceptReconciliationItemCore(actor, input);
  refreshMigration();
  return result;
});

export const signOffMigrationBatchAction = adminAction(async ({ actor }, batchId: string) => {
  const result = await signOffMigrationBatchCore(actor, batchId);
  refreshMigration();
  return result;
});

export const publishMigrationBatchAction = adminAction(async ({ actor }, batchId: string) => {
  const result = await publishMigrationBatchCore(actor, batchId);
  refreshMigration();
  return result;
});

export const discardMigrationBatchAction = adminAction(async (_ctx, batchId: string) => {
  const result = await discardMigrationBatchCore(batchId);
  refreshMigration();
  return result;
});
