import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function isLegacySha256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const digest = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    SCRYPT_PREFIX,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    digest.toString("base64"),
  ].join("$");
}

function verifyScryptPassword(plain: string, hash: string): boolean {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");

  if (
    !Number.isFinite(n) ||
    !Number.isFinite(r) ||
    !Number.isFinite(p) ||
    salt.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }

  try {
    const derived = scryptSync(plain, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyLegacySha256Password(plain: string, hash: string): boolean {
  const computed = sha256Hex(plain).toLowerCase();
  const expected = hash.toLowerCase();
  return timingSafeEqual(Buffer.from(computed), Buffer.from(expected));
}

export function verifyPassword(plain: string, hash: string): boolean {
  if (!hash) return false;
  if (hash.startsWith(`${SCRYPT_PREFIX}$`)) {
    return verifyScryptPassword(plain, hash);
  }
  if (isLegacySha256Hash(hash)) {
    return verifyLegacySha256Password(plain, hash);
  }
  return false;
}

