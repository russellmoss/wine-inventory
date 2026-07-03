import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  seal,
  open,
  buildAad,
  makeKeyring,
  type EnvelopeAad,
  type Keyring,
} from "@/lib/crypto/envelope";

// Phase 15 Unit 1 (SEC-C4 / SEC-N1) — AEAD envelope encryption for tenant OAuth tokens.
// Per-record DEK (random 32B) encrypts the token; the DEK is wrapped by an env KEK. AAD binds the
// row identity (table|provider|environment|tenantId|connectionId|fieldName|kid) so a ciphertext can
// never be transplanted across rows, tenants, fields, or environments. Old kids stay decryptable.

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

// A keyring with `kek1` active; `kek0` retired-but-decryptable (rotation).
function ring(active = "kek1"): Keyring {
  return makeKeyring(active, { kek1: KEY_A, kek0: KEY_B });
}

const AAD: EnvelopeAad = {
  table: "accounting_connection",
  provider: "QBO",
  environment: "sandbox",
  tenantId: "org_demo_winery",
  connectionId: "conn_abc123",
  fieldName: "refreshToken",
};

describe("envelope seal/open round-trip", () => {
  it("round-trips a secret through seal → open", () => {
    const secret = "AB11730000000-refresh-token-value";
    const sealed = seal(secret, AAD, ring());
    expect(sealed.ciphertext).toContain(".");
    expect(sealed.wrappedDek.startsWith("kek1.")).toBe(true);
    expect(open(sealed, AAD, ring())).toBe(secret);
  });

  it("encrypts unicode + empty-ish payloads", () => {
    for (const s of ["", "x", "réfrèsh•token", "日本語のトークン"]) {
      const sealed = seal(s, AAD, ring());
      expect(open(sealed, AAD, ring())).toBe(s);
    }
  });
});

describe("AAD binding — ciphertext cannot be transplanted", () => {
  it("open with a swapped tenantId fails", () => {
    const sealed = seal("secret", AAD, ring());
    expect(() => open(sealed, { ...AAD, tenantId: "org_bhutan_wine_co" }, ring())).toThrow();
  });

  it("open with a swapped fieldName fails", () => {
    const sealed = seal("secret", AAD, ring());
    expect(() => open(sealed, { ...AAD, fieldName: "accessToken" }, ring())).toThrow();
  });

  it("open with a swapped environment fails (sandbox ↔ production)", () => {
    const sealed = seal("secret", AAD, ring());
    expect(() => open(sealed, { ...AAD, environment: "production" }, ring())).toThrow();
  });

  it("open with a swapped connectionId fails", () => {
    const sealed = seal("secret", AAD, ring());
    expect(() => open(sealed, { ...AAD, connectionId: "conn_other" }, ring())).toThrow();
  });
});

describe("tamper detection", () => {
  it("a tampered token-ciphertext byte fails auth", () => {
    const sealed = seal("secret", AAD, ring());
    const [iv, ct, tag] = sealed.ciphertext.split(".");
    const buf = Buffer.from(ct, "base64");
    buf[0] ^= 0xff;
    const tampered = { ...sealed, ciphertext: `${iv}.${buf.toString("base64")}.${tag}` };
    expect(() => open(tampered, AAD, ring())).toThrow();
  });

  it("a tampered auth tag fails", () => {
    const sealed = seal("secret", AAD, ring());
    const [iv, ct, tag] = sealed.ciphertext.split(".");
    const buf = Buffer.from(tag, "base64");
    buf[0] ^= 0xff;
    const tampered = { ...sealed, ciphertext: `${iv}.${ct}.${buf.toString("base64")}` };
    expect(() => open(tampered, AAD, ring())).toThrow();
  });

  it("a tampered wrapped-DEK fails", () => {
    const sealed = seal("secret", AAD, ring());
    const [kid, iv, wct, tag] = sealed.wrappedDek.split(".");
    const buf = Buffer.from(wct, "base64");
    buf[0] ^= 0xff;
    const tampered = { ...sealed, wrappedDek: `${kid}.${iv}.${buf.toString("base64")}.${tag}` };
    expect(() => open(tampered, AAD, ring())).toThrow();
  });
});

describe("keyring", () => {
  it("wrong key fails to unwrap the DEK", () => {
    const sealed = seal("secret", AAD, ring());
    // A keyring where `kek1` maps to a DIFFERENT key.
    const wrong = makeKeyring("kek1", { kek1: KEY_B });
    expect(() => open(sealed, AAD, wrong)).toThrow();
  });

  it("picks the correct kid on decrypt after rotation (old kid still opens)", () => {
    // Seal under a keyring whose active kid is kek0…
    const sealedOld = seal("secret", AAD, makeKeyring("kek0", { kek0: KEY_B, kek1: KEY_A }));
    expect(sealedOld.wrappedDek.startsWith("kek0.")).toBe(true);
    // …then open under a keyring rotated to kek1 active — kek0 is retired but present, so it opens.
    expect(open(sealedOld, AAD, makeKeyring("kek1", { kek1: KEY_A, kek0: KEY_B }))).toBe("secret");
  });

  it("rejects a KEK that is not 32 bytes", () => {
    expect(() => makeKeyring("bad", { bad: randomBytes(16).toString("base64") })).toThrow();
  });

  it("rejects an active kid missing from the ring", () => {
    expect(() => makeKeyring("nope", { kek1: KEY_A })).toThrow();
  });
});

describe("IV uniqueness", () => {
  it("two seals of the same input produce different IVs + ciphertext", () => {
    const a = seal("secret", AAD, ring());
    const b = seal("secret", AAD, ring());
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
    // both still open to the same plaintext
    expect(open(a, AAD, ring())).toBe(open(b, AAD, ring()));
  });
});

describe("buildAad", () => {
  it("is a stable, order-fixed, kid-bound string", () => {
    expect(buildAad(AAD, "kek1")).toBe(
      "accounting_connection|QBO|sandbox|org_demo_winery|conn_abc123|refreshToken|kek1",
    );
  });
});
