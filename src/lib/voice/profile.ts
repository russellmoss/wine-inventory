import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { VoiceFocusDefaultMode, VoiceProfileStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { seal, open, type EnvelopeAad } from "@/lib/crypto/envelope";
import {
  averageVoiceprints,
  compareVoiceprints,
  DEFAULT_VOICEPRINT_THRESHOLD,
  voiceprintQuality,
  VOICEPRINT_VERSION,
} from "@/lib/voice/voiceprint";
import type { VoiceFocusMode, VoiceProfileState } from "@/lib/voice/focus";
import type { VoiceSettingsView } from "@/lib/voice/settings-types";

export const VOICE_CONSENT_VERSION = "2026-07-08.voice-focus.v1";
const RECEIPT_TTL_MS = 60_000;

export type VoiceVerificationReceiptPayload = {
  tenantId: string;
  userId: string;
  voiceSessionId: string;
  focusMode: VoiceFocusMode;
  issuedAt: number;
  provider: string;
  modelVersion: string;
};

function profileAad(tenantId: string, profileId: string): EnvelopeAad {
  return {
    table: "voice_profile",
    provider: "local_voiceprint",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    tenantId,
    connectionId: profileId,
    fieldName: "embeddingCt",
  };
}

function receiptSecret(): Buffer {
  const material = process.env.APP_ENCRYPTION_KEK || process.env.ELEVENLABS_API_KEY;
  if (!material) throw new Error("No signing key configured for voice verification receipts.");
  return Buffer.from(material);
}

function signReceiptPayload(payload: VoiceVerificationReceiptPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", receiptSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyVoiceReceipt(
  receipt: string,
  expected: Pick<VoiceVerificationReceiptPayload, "tenantId" | "userId" | "voiceSessionId" | "focusMode">,
  nowMs = Date.now(),
): VoiceVerificationReceiptPayload | null {
  const [body, sig] = receipt.split(".");
  if (!body || !sig) return null;
  const expectedSig = createHmac("sha256", receiptSecret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expectedSig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  let payload: VoiceVerificationReceiptPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as VoiceVerificationReceiptPayload;
  } catch {
    return null;
  }
  if (payload.tenantId !== expected.tenantId) return null;
  if (payload.userId !== expected.userId) return null;
  if (payload.voiceSessionId !== expected.voiceSessionId) return null;
  if (payload.focusMode !== expected.focusMode) return null;
  if (!Number.isFinite(payload.issuedAt) || nowMs - payload.issuedAt > RECEIPT_TTL_MS) return null;
  return payload;
}

function dbModeToFocus(mode: VoiceFocusDefaultMode | null | undefined): VoiceFocusMode {
  if (mode === "MY_VOICE") return "my_voice";
  if (mode === "TEAM_SESSION") return "team_session";
  return "open";
}

function focusToDbMode(mode: VoiceFocusMode): VoiceFocusDefaultMode {
  if (mode === "my_voice") return "MY_VOICE";
  if (mode === "team_session") return "TEAM_SESSION";
  return "OPEN";
}

function dbStatusToState(status: VoiceProfileStatus | null | undefined): VoiceProfileState {
  if (status === "ACTIVE") return "active";
  if (status === "NEEDS_REENROLL") return "needs_reenroll";
  if (status === "DISABLED") return "disabled";
  return "not_enrolled";
}

function qualityLabel(score: number | null | undefined): VoiceSettingsView["profile"]["qualityLabel"] {
  if (score == null) return null;
  if (score >= 0.9) return "Good";
  if (score >= 0.78) return "Fair";
  return "Needs work";
}

export function voiceRecognitionAvailable(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEK);
}

export async function getVoiceSettingsForUser(userId: string): Promise<VoiceSettingsView> {
  const [profile, preference] = await Promise.all([
    prisma.voiceProfile.findFirst({
      where: { userId },
      select: { status: true, createdAt: true, enrollmentQuality: true },
    }),
    prisma.voicePreference.findFirst({
      where: { userId },
      select: { defaultFocusMode: true, audioIsolationEnabled: true, wakeWordEnabled: true },
    }),
  ]);

  const state = dbStatusToState(profile?.status);
  const defaultFocusMode = state === "active" ? dbModeToFocus(preference?.defaultFocusMode) : "open";
  return {
    available: voiceRecognitionAvailable(),
    unavailableReason: voiceRecognitionAvailable() ? null : "Voice recognition is not configured for this winery yet.",
    profile: {
      state,
      enrolledAt: profile?.createdAt.toISOString() ?? null,
      qualityLabel: qualityLabel(profile?.enrollmentQuality),
    },
    preference: {
      defaultFocusMode,
      audioIsolationEnabled: preference?.audioIsolationEnabled ?? false,
      wakeWordEnabled: false,
    },
  };
}

export async function saveVoicePreferenceForUser(
  userId: string,
  input: { defaultFocusMode?: VoiceFocusMode; audioIsolationEnabled?: boolean; wakeWordEnabled?: boolean },
): Promise<VoiceSettingsView> {
  const tenantId = requireTenantId();
  const profile = await prisma.voiceProfile.findFirst({ where: { userId }, select: { status: true } });
  const profileActive = profile?.status === "ACTIVE";
  const defaultFocusMode = input.defaultFocusMode === "my_voice" && !profileActive ? "open" : input.defaultFocusMode;
  await prisma.voicePreference.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {
      ...(defaultFocusMode ? { defaultFocusMode: focusToDbMode(defaultFocusMode) } : {}),
      ...(typeof input.audioIsolationEnabled === "boolean" ? { audioIsolationEnabled: input.audioIsolationEnabled } : {}),
      ...(typeof input.wakeWordEnabled === "boolean" ? { wakeWordEnabled: false } : {}),
    },
    create: {
      userId,
      defaultFocusMode: focusToDbMode(defaultFocusMode ?? "open"),
      audioIsolationEnabled: input.audioIsolationEnabled ?? false,
      wakeWordEnabled: false,
    },
  });
  return getVoiceSettingsForUser(userId);
}

export async function enrollVoiceProfileForUser(
  tenantId: string,
  userId: string,
  vectors: readonly (readonly number[])[],
): Promise<VoiceSettingsView> {
  if (!voiceRecognitionAvailable()) throw new Error("Voice recognition is not configured.");
  if (vectors.length < 3) throw new Error("Three voice samples are required.");

  const existing = await prisma.voiceProfile.findFirst({ where: { userId }, select: { id: true } });
  const profileId = existing?.id ?? randomUUID();
  const averaged = averageVoiceprints(vectors);
  const quality = voiceprintQuality(vectors);
  const sealed = seal(JSON.stringify(averaged), profileAad(tenantId, profileId));

  await prisma.voiceProfile.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {
      status: "ACTIVE",
      provider: "LOCAL_VOICEPRINT",
      providerRef: null,
      embeddingCt: sealed.ciphertext,
      dekWrapped: sealed.wrappedDek,
      modelVersion: VOICEPRINT_VERSION,
      threshold: DEFAULT_VOICEPRINT_THRESHOLD,
      enrollmentQuality: quality,
      consentAcceptedAt: new Date(),
      consentVersion: VOICE_CONSENT_VERSION,
      lastVerifiedAt: null,
    },
    create: {
      id: profileId,
      userId,
      status: "ACTIVE",
      provider: "LOCAL_VOICEPRINT",
      embeddingCt: sealed.ciphertext,
      dekWrapped: sealed.wrappedDek,
      modelVersion: VOICEPRINT_VERSION,
      threshold: DEFAULT_VOICEPRINT_THRESHOLD,
      enrollmentQuality: quality,
      consentAcceptedAt: new Date(),
      consentVersion: VOICE_CONSENT_VERSION,
    },
  });
  await prisma.voicePreference.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { defaultFocusMode: "MY_VOICE", wakeWordEnabled: false },
    create: { userId, defaultFocusMode: "MY_VOICE", wakeWordEnabled: false },
  });
  return getVoiceSettingsForUser(userId);
}

export async function deleteVoiceProfileForUser(userId: string): Promise<VoiceSettingsView> {
  const tenantId = requireTenantId();
  await prisma.voiceProfile.deleteMany({ where: { userId } });
  await prisma.voicePreference.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { defaultFocusMode: "OPEN", wakeWordEnabled: false },
    create: { userId, defaultFocusMode: "OPEN", wakeWordEnabled: false },
  });
  return getVoiceSettingsForUser(userId);
}

export async function verifyVoiceprintForUser(input: {
  tenantId: string;
  userId: string;
  candidateVector: readonly number[];
  voiceSessionId: string;
  focusMode: VoiceFocusMode;
}): Promise<{ matched: boolean; receipt: string | null; profileState: VoiceProfileState }> {
  const profile = await prisma.voiceProfile.findFirst({
    where: { userId: input.userId, status: "ACTIVE" },
    select: { id: true, embeddingCt: true, dekWrapped: true, threshold: true, modelVersion: true, provider: true, status: true },
  });
  if (!profile?.embeddingCt || !profile.dekWrapped) {
    return { matched: false, receipt: null, profileState: dbStatusToState(profile?.status) };
  }

  let parsed: { vector?: unknown };
  try {
    const plaintext = open(
      { ciphertext: profile.embeddingCt, wrappedDek: profile.dekWrapped },
      profileAad(input.tenantId, profile.id),
    );
    parsed = JSON.parse(plaintext) as { vector?: unknown };
  } catch {
    return { matched: false, receipt: null, profileState: "needs_reenroll" };
  }
  const enrolledVector = Array.isArray(parsed.vector) ? parsed.vector.map(Number) : [];
  const match = compareVoiceprints(enrolledVector, input.candidateVector, profile.threshold);
  if (!match.matched) return { matched: false, receipt: null, profileState: "active" };

  await prisma.voiceProfile.update({
    where: { id: profile.id },
    data: { lastVerifiedAt: new Date() },
  });

  return {
    matched: true,
    profileState: "active",
    receipt: signReceiptPayload({
      tenantId: input.tenantId,
      userId: input.userId,
      voiceSessionId: input.voiceSessionId,
      focusMode: input.focusMode,
      issuedAt: Date.now(),
      provider: profile.provider,
      modelVersion: profile.modelVersion,
    }),
  };
}
