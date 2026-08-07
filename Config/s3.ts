import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const endpoint = process.env.AWS_S3_ENDPOINT;
const publicBaseUrl = process.env.AWS_S3_PUBLIC_URL;

const s3Client = new S3Client({
  region,
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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
