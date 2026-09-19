import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import path from "path";

const firstEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

// Newer AWS SDK versions sign optional checksum headers that browsers cannot
// replay on a presigned PUT. Keep checksums off unless the API requires them.
if (!process.env.AWS_REQUEST_CHECKSUM_CALCULATION) {
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION = "WHEN_REQUIRED";
}
if (!process.env.AWS_RESPONSE_CHECKSUM_VALIDATION) {
  process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = "WHEN_REQUIRED";
}

const region = firstEnv("AWS_REGION", "S3_REGION", "AWS_DEFAULT_REGION");
const bucket = firstEnv("AWS_S3_BUCKET", "S3_AUDIO_BUCKET", "S3_BUCKET");
const endpoint = firstEnv("AWS_S3_ENDPOINT");
const publicBaseUrl = firstEnv("AWS_S3_PUBLIC_URL");
const accessKeyId = firstEnv("AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID");
const secretAccessKey = firstEnv(
  "AWS_SECRET_ACCESS_KEY",
  "SECREATE_KEY_ACCESS",
);

const s3Client = new S3Client({
  region,
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : undefined,
});

const hasS3Config = Boolean(region && bucket);

const getImageExtension = (mimeType: string, originalName: string) => {
  const extensionFromName = path.extname(originalName).toLowerCase();

  if (extensionFromName) {
    return extensionFromName;
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return ".jpg";
};

export const uploadProfileImageToS3 = async ({
  userId,
  buffer,
  mimeType,
  originalName,
}: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) => {
  const extension = getImageExtension(mimeType, originalName);
  const key = `profile-images/${userId}/${randomUUID()}${extension}`;

  if (!hasS3Config) {
    return {
      key,
      url: `data:${mimeType};base64,${buffer.toString("base64")}`,
    };
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const normalizedPublicBaseUrl = publicBaseUrl?.replace(/\/$/, "");
  const url = normalizedPublicBaseUrl
    ? `${normalizedPublicBaseUrl}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return {
    key,
    url,
  };
};

export const getSharedS3Client = () => s3Client;

export const getSharedS3Bucket = () => bucket;

export const getSharedS3Region = () => region;

export const hasSharedS3Config = () => hasS3Config;

export const createPresignedPutUrl = async ({
  key,
  contentType,
  expiresInSeconds,
}: {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}) => {
  if (!hasS3Config || !bucket) {
    throw new Error("S3 is not configured");
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds,
  });
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return { uploadUrl, expiresAt, bucket };
};

export const createPresignedGetUrl = async ({
  key,
  expiresInSeconds,
}: {
  key: string;
  expiresInSeconds: number;
}) => {
  if (!hasS3Config || !bucket) {
    throw new Error("S3 is not configured");
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds,
  });
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return { url, expiresAt, bucket };
};

export const headS3Object = async (key: string) => {
  if (!hasS3Config || !bucket) {
    throw new Error("S3 is not configured");
  }

  const result = await s3Client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  return {
    bucket,
    key,
    etag: result.ETag?.replaceAll('"', "") ?? null,
    sizeBytes: result.ContentLength ?? null,
    contentType: result.ContentType ?? null,
  };
};
