import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const TOKEN_ENCRYPTION_FORMAT = "v1";

function getKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function encryptSecret(value: string, secret: string, version = TOKEN_ENCRYPTION_FORMAT) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(".");
}

function decryptWithKey(value: string, secret: string) {
  const parts = value.split(".");
  const [ivValue, tagValue, encryptedValue] = parts.length === 4 ? parts.slice(1) : parts;
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored Google credential is malformed.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(secret), fromBase64Url(ivValue));
  decipher.setAuthTag(fromBase64Url(tagValue));
  return Buffer.concat([decipher.update(fromBase64Url(encryptedValue)), decipher.final()]).toString("utf8");
}

export function decryptSecret(value: string, secret: string, previousSecrets: ReadonlyArray<string> = []) {
  let lastError: unknown;
  for (const candidate of [secret, ...previousSecrets]) {
    try {
      return decryptWithKey(value, candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Stored Google credential could not be decrypted.");
}
