import crypto from "crypto";

const VERSION = "v1";

const resolveKey = () => {
  const raw =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_TOKEN_SECRET ||
    process.env.SESSION_SECRET;

  if (!raw) {
    throw new Error("Token encryption secret is not configured");
  }

  return crypto.createHash("sha256").update(raw).digest();
};

/** AES-256-GCM; output is `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export const encryptSecret = (plain: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
};

export const decryptSecret = (sealed: string) => {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    resolveKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};
