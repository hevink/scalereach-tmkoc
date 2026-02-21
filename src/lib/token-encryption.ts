import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.TOKEN_ENCRYPTION_KEY || "";

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Generate with: openssl rand -hex 32");
  }
  return Buffer.from(KEY_HEX, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv(24 hex) + authTag(32 hex) + ciphertext(hex)
  return iv.toString("hex") + authTag.toString("hex") + encrypted.toString("hex");
}

export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const iv = Buffer.from(ciphertext.slice(0, 24), "hex");
  const authTag = Buffer.from(ciphertext.slice(24, 56), "hex");
  const encrypted = Buffer.from(ciphertext.slice(56), "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
