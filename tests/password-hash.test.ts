import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, isLegacySha256Hash, verifyPassword } from "../server/_core/password";

describe("password hashing", () => {
  it("hashPassword should generate scrypt hash and verify successfully", () => {
    const plain = "P@ssw0rd-123!";
    const hash = hashPassword(plain);

    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword(plain, hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("verifyPassword should support legacy SHA-256 hashes", () => {
    const plain = "legacy-pass";
    const legacyHash = createHash("sha256").update(plain).digest("hex");

    expect(isLegacySha256Hash(legacyHash)).toBe(true);
    expect(verifyPassword(plain, legacyHash)).toBe(true);
    expect(verifyPassword("wrong-password", legacyHash)).toBe(false);
  });
});

