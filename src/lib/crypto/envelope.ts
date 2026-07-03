import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * Phase 15 Unit 1 (SEC-C4 / SEC-N1) — AEAD envelope encryption for tenant OAuth tokens.
 *
 * Two-layer envelope so the encryption-key blast radius is one row, not the whole table:
 *   1. a random per-record 32-byte DATA KEY (DEK) encrypts the secret (AES-256-GCM), and
 *   2. that DEK is WRAPPED (encrypted) by a shared KEY-ENCRYPTION-KEY (KEK) held in env.
 * Only the KEK lives in the environment; every token row carries its own DEK. The KEK can later be
 * moved to a cloud KMS WITHOUT re-encrypting rows — you only re-wrap the (short) DEKs. Sandbox and
 * production KEKs are always split (different env values per deploy).
 *
 * AAD binds `table|provider|environment|tenantId|connectionId|fieldName|kid` to the DEK wrap, so a
 * stored envelope cannot be transplanted onto another row, tenant, field, or environment: unwrapping
 * the DEK with a different AAD fails authentication, so the secret is unrecoverable. Pure Node crypto,
 * no imports beyond `node:crypto`, so it is unit-tested without a DB or the app. NEVER log secrets.
 *
 * Serialized shapes (base64 parts joined by `.` — base64 has no `.`, so it is an unambiguous sep):
 *   ciphertext  = `<dataIv>.<dataCt>.<dataTag>`               (stored in the token ciphertext column)
 *   wrappedDek  = `<kekKid>.<wrapIv>.<wrappedDek>.<wrapTag>`  (stored alongside; kid drives rotation)
 */

const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256
const ALGO = "aes-256-gcm";
const KID_RE = /^[A-Za-z0-9_-]+$/; // no `.` (our separator), keeps kids env/URL-safe

export type EnvelopeAad = {
  table: string;
  provider: string;
  environment: string;
  tenantId: string;
  connectionId: string;
  fieldName: string;
};

export type Sealed = {
  /** `<dataIv>.<dataCt>.<dataTag>` — the token, encrypted under its per-record DEK. */
  ciphertext: string;
  /** `<kekKid>.<wrapIv>.<wrappedDek>.<wrapTag>` — the DEK, wrapped by the KEK (AAD-bound). */
  wrappedDek: string;
};

/** A resolved KEK keyring: an active kid for new seals + every kid available for decrypt (rotation). */
export type Keyring = {
  activeKid: string;
  keys: ReadonlyMap<string, Buffer>;
};

/** The order-fixed, kid-bound AAD string. Any drift in a bound field makes the DEK unwrap fail. */
export function buildAad(aad: EnvelopeAad, kid: string): string {
  return [aad.table, aad.provider, aad.environment, aad.tenantId, aad.connectionId, aad.fieldName, kid].join("|");
}

/**
 * Build a keyring from an active kid + a `{ kid: base64Key }` map. Every key MUST decode to exactly
 * 32 bytes and the active kid MUST be present. Throws otherwise (fail-closed — a misconfigured key
 * must never silently degrade to a short/absent key).
 */
export function makeKeyring(activeKid: string, keysB64: Record<string, string>): Keyring {
  if (!KID_RE.test(activeKid)) throw new Error(`Invalid KEK kid "${activeKid}" (must match ${KID_RE}).`);
  const keys = new Map<string, Buffer>();
  for (const [kid, b64] of Object.entries(keysB64)) {
    if (!KID_RE.test(kid)) throw new Error(`Invalid KEK kid "${kid}" (must match ${KID_RE}).`);
    const key = Buffer.from(b64, "base64");
    if (key.length !== KEY_BYTES) throw new Error(`KEK "${kid}" must be ${KEY_BYTES} bytes (got ${key.length}).`);
    keys.set(kid, key);
  }
  if (!keys.has(activeKid)) throw new Error(`Active KEK kid "${activeKid}" is not present in the keyring.`);
  return { activeKid, keys };
}

/**
 * Load the KEK keyring from the environment:
 *   APP_ENCRYPTION_KEK       — base64 of the ACTIVE 32-byte KEK (required).
 *   APP_ENCRYPTION_KEK_KID   — id for the active KEK (default "kek1"); embedded in every wrappedDek.
 *   APP_ENCRYPTION_KEK_RING  — optional JSON `{ "<kid>": "<base64Key>" }` of RETIRED-but-decryptable
 *                              KEKs, so rows sealed under an old kid still open after rotation.
 * Read fresh each call (crypto dwarfs the parse) so a key rotation in env takes effect immediately.
 */
export function loadKeyring(): Keyring {
  const active = process.env.APP_ENCRYPTION_KEK;
  if (!active) throw new Error("APP_ENCRYPTION_KEK is not set — cannot encrypt/decrypt tokens.");
  const activeKid = process.env.APP_ENCRYPTION_KEK_KID || "kek1";
  const keysB64: Record<string, string> = { [activeKid]: active };
  const ringJson = process.env.APP_ENCRYPTION_KEK_RING;
  if (ringJson) {
    let retired: Record<string, string>;
    try {
      retired = JSON.parse(ringJson) as Record<string, string>;
    } catch {
      throw new Error("APP_ENCRYPTION_KEK_RING is not valid JSON.");
    }
    for (const [kid, b64] of Object.entries(retired)) {
      if (kid !== activeKid) keysB64[kid] = b64; // active wins if a kid collides
    }
  }
  return makeKeyring(activeKid, keysB64);
}

function b64(buf: Buffer): string {
  return buf.toString("base64");
}

/** Encrypt `plaintext` under a fresh per-record DEK, wrapping the DEK with the active KEK. */
export function seal(plaintext: string, aad: EnvelopeAad, keyring: Keyring = loadKeyring()): Sealed {
  const kid = keyring.activeKid;
  const kek = keyring.keys.get(kid);
  if (!kek) throw new Error(`Active KEK "${kid}" missing from keyring.`);

  // Layer 1: encrypt the secret with a random DEK (no AAD needed here — the DEK is single-use).
  const dek = randomBytes(KEY_BYTES);
  const dataIv = randomBytes(IV_BYTES);
  const dataCipher = createCipheriv(ALGO, dek, dataIv);
  const dataCt = Buffer.concat([dataCipher.update(plaintext, "utf8"), dataCipher.final()]);
  const dataTag = dataCipher.getAuthTag();

  // Layer 2: wrap the DEK with the KEK, binding the row identity as AAD.
  const wrapIv = randomBytes(IV_BYTES);
  const wrapCipher = createCipheriv(ALGO, kek, wrapIv);
  wrapCipher.setAAD(Buffer.from(buildAad(aad, kid), "utf8"));
  const wrapped = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
  const wrapTag = wrapCipher.getAuthTag();

  return {
    ciphertext: `${b64(dataIv)}.${b64(dataCt)}.${b64(dataTag)}`,
    wrappedDek: `${kid}.${b64(wrapIv)}.${b64(wrapped)}.${b64(wrapTag)}`,
  };
}

/** Reverse of {@link seal}. Throws on any tamper, wrong key, or AAD/identity mismatch. */
export function open(sealed: Sealed, aad: EnvelopeAad, keyring: Keyring = loadKeyring()): string {
  const wrapParts = sealed.wrappedDek.split(".");
  if (wrapParts.length !== 4) throw new Error("Malformed wrappedDek.");
  const [kid, wrapIvB64, wrappedB64, wrapTagB64] = wrapParts;
  const kek = keyring.keys.get(kid);
  if (!kek) throw new Error(`No KEK for kid "${kid}" in the keyring.`);

  // Unwrap the DEK (authenticates the AAD — a transplanted row / swapped field fails here).
  const wrapDecipher = createDecipheriv(ALGO, kek, Buffer.from(wrapIvB64, "base64"));
  wrapDecipher.setAAD(Buffer.from(buildAad(aad, kid), "utf8"));
  wrapDecipher.setAuthTag(Buffer.from(wrapTagB64, "base64"));
  const dek = Buffer.concat([wrapDecipher.update(Buffer.from(wrappedB64, "base64")), wrapDecipher.final()]);

  // Decrypt the secret with the recovered DEK.
  const dataParts = sealed.ciphertext.split(".");
  if (dataParts.length !== 3) throw new Error("Malformed ciphertext.");
  const [dataIvB64, dataCtB64, dataTagB64] = dataParts;
  const dataDecipher = createDecipheriv(ALGO, dek, Buffer.from(dataIvB64, "base64"));
  dataDecipher.setAuthTag(Buffer.from(dataTagB64, "base64"));
  const plain = Buffer.concat([dataDecipher.update(Buffer.from(dataCtB64, "base64")), dataDecipher.final()]);
  return plain.toString("utf8");
}
