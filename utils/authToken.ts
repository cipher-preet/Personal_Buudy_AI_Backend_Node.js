import crypto from "crypto";

const base64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return Buffer.from(padded, "base64").toString("utf8");
};

export const createAuthToken = (payload: {
  userId: string;
  provider: string;
}) => {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Auth token secret is not configured");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 60 * 60 * 24 * 30;
  const body = {
    ...payload,
    iat: issuedAt,
    exp: expiresAt,
  };

  const encodedPayload = base64Url(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedPayload}.${signature}`;
};

export const verifyAuthToken = (token: string) => {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Auth token secret is not configured");
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as {
    userId: string;
    provider: string;
    exp: number;
  };

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
};
