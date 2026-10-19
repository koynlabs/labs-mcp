import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * X access and refresh tokens share one sealed blob. The key is
 * X_TOKEN_ENCRYPTION_KEY, or the X client secret when that is unset, so a
 * leaked Redis row is not a usable token. Rotating the secret makes stored
 * tokens unreadable, which is the point of keeping it separate from
 * LABS_SESSION_SECRET.
 */
function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(
    ".",
  );
}

export function openSecret(packed: string, secret: string): string {
  const [iv, tag, body] = packed.split(".");
  if (!iv || !tag || !body) throw new Error("sealed X token is unreadable");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return decipher.update(Buffer.from(body, "base64")).toString("utf8") + decipher.final("utf8");
}
