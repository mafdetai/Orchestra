import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./env";

const ENC_PREFIX = "enc:v1:";
const IV_LENGTH = 12; // AES-GCM recommended nonce size
const TAG_LENGTH = 16; // GCM auth tag size

function getEncryptionKey(): Buffer {
  // Priority: dedicated secret -> cookie secret -> gemini key -> dev fallback
  const secret =
    process.env.MODEL_KEY_ENCRYPTION_SECRET ||
    ENV.cookieSecret ||
    ENV.geminiApiKey ||
    "dev-model-key-secret-change-me";
  return createHash("sha256").update(secret).digest();
}

export function isEncryptedModelKey(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export function encryptModelKey(plainText: string): string {
  if (!plainText) return "";
  if (isEncryptedModelKey(plainText)) return plainText;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64url");
  return `${ENC_PREFIX}${payload}`;
}

export function decryptModelKey(cipherText: string): string {
  if (!cipherText) return "";
  // Backward compatibility for historical plaintext rows
  if (!isEncryptedModelKey(cipherText)) return cipherText;

  const key = getEncryptionKey();
  const payload = Buffer.from(cipherText.slice(ENC_PREFIX.length), "base64url");
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("MODEL_KEY_DECRYPT_INVALID_PAYLOAD");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskModelKey(plainText: string): string {
  if (!plainText) return "";
  return `...${plainText.slice(-4)}`;
}
