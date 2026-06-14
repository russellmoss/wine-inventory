import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// Argon2id parameters. OWASP-aligned for a low-traffic internal app.
const OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, OPTS);
}

export async function verifyPassword(args: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    return await argonVerify(args.hash, args.password);
  } catch {
    return false;
  }
}
