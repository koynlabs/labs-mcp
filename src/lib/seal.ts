import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Maker quoting keys and Jupiter trigger sessions share one secret. A leaked
 * row is ciphertext; rotating LABS_SESSION_SECRET invalidates both.
 */
function encryptionKey(): Buffer {
  const secret = process.env.LABS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "LABS_SESSION_SECRET must be set to at least 32 characters before this can be stored",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(
    ".",
  );
}

export function decrypt(packed: string): string {
  const [iv, tag, body] = packed.split(".");
  if (!iv || !tag || !body) throw new Error("sealed value is unreadable");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return decipher.update(Buffer.from(body, "base64")).toString("utf8") + decipher.final("utf8");
}
