import mongoose from "mongoose";

import {
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MeetingErrorCode,
  MeetingMediaKind,
  MeetingProvider,
} from "./constants.js";
import { MeetingError } from "./errors.js";
import type { MeetingConfig } from "./config.js";

export const normalizeMimeType = (mimeType: unknown) => {
  if (typeof mimeType !== "string" || !mimeType.trim()) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_MIME_TYPE,
      "MIME type is required.",
      400,
    );
  }
  return mimeType.split(";", 1)[0].trim().toLowerCase();
};

export const assertAllowedMimeType = (mimeType: unknown) => {
  const normalized = normalizeMimeType(mimeType);
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_MIME_TYPE,
      "Unsupported recording MIME type.",
      400,
      { mimeType: normalized },
    );
  }
  return normalized;
};

export const parseMediaKind = (value: unknown, mimeType: string): MeetingMediaKind => {
  if (typeof value === "string" && value.trim()) {
    const kind = value.trim().toLowerCase();
    if (
      kind === MeetingMediaKind.AUDIO ||
      kind === MeetingMediaKind.VIDEO ||
      kind === MeetingMediaKind.MUXED
    ) {
      if (kind === MeetingMediaKind.AUDIO && !ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
        throw new MeetingError(
          MeetingErrorCode.MEETING_INVALID_MIME_TYPE,
          "Audio chunks require an audio MIME type.",
          400,
        );
      }
      if (kind === MeetingMediaKind.VIDEO && !ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
        throw new MeetingError(
          MeetingErrorCode.MEETING_INVALID_MIME_TYPE,
          "Video chunks require a video MIME type.",
          400,
        );
      }
      return kind;
    }
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "mediaKind must be audio, video, or muxed.",
      400,
    );
  }
  if (ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
    return MeetingMediaKind.AUDIO;
  }
  return MeetingMediaKind.MUXED;
};

export const parseProvider = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return MeetingProvider.UNKNOWN;
  }
  if (typeof value !== "string") {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "provider must be a string.",
      400,
    );
  }
  const provider = value.trim().toUpperCase();
  if (
    provider === MeetingProvider.GOOGLE_MEET ||
    provider === MeetingProvider.ZOOM ||
    provider === MeetingProvider.MICROSOFT_TEAMS ||
    provider === MeetingProvider.UNKNOWN
  ) {
    return provider;
  }
  throw new MeetingError(
    MeetingErrorCode.MEETING_INVALID_INPUT,
    "Unsupported meeting provider.",
    400,
  );
};

export const parseObjectId = (value: unknown, label: string) => {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `Invalid ${label}.`,
      400,
    );
  }
  return value;
};

export const parseOptionalObjectId = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return parseObjectId(value, label);
};

export const parseSequence = (value: unknown) => {
  const sequence = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 100_000) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_SEQUENCE,
      "sequence must be an integer between 1 and 100000.",
      400,
    );
  }
  return sequence;
};

export const parseNonNegativeInt = (
  value: unknown,
  label: string,
  required = true,
) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_INVALID_INPUT,
        `${label} is required.`,
        400,
      );
    }
    return undefined;
  }
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `${label} must be a non-negative integer.`,
      400,
    );
  }
  return parsed;
};

export const parseChunkTiming = (
  body: Record<string, unknown>,
  config: MeetingConfig,
) => {
  const startOffsetMs = parseNonNegativeInt(body.startOffsetMs, "startOffsetMs")!;
  const endOffsetMs = parseNonNegativeInt(body.endOffsetMs, "endOffsetMs")!;
  if (endOffsetMs <= startOffsetMs) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "endOffsetMs must be greater than startOffsetMs.",
      400,
    );
  }
  const durationMs =
    parseNonNegativeInt(body.durationMs, "durationMs", false) ??
    endOffsetMs - startOffsetMs;
  if (durationMs <= 0) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "durationMs must be greater than zero.",
      400,
    );
  }
  if (durationMs > config.chunkMaxDurationMs) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "Chunk duration exceeds configured limit.",
      400,
      { maxDurationMs: config.chunkMaxDurationMs },
    );
  }
  return { startOffsetMs, endOffsetMs, durationMs };
};

export const parseSizeBytes = (value: unknown, config: MeetingConfig) => {
  const sizeBytes = parseNonNegativeInt(value, "sizeBytes")!;
  if (sizeBytes <= 0) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_ZERO_BYTE_CHUNK,
      "Chunk size must be greater than zero.",
      400,
    );
  }
  if (sizeBytes > config.chunkMaxSizeBytes) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_CHUNK_TOO_LARGE,
      "Chunk exceeds configured size limit.",
      400,
      { maxSizeBytes: config.chunkMaxSizeBytes },
    );
  }
  return sizeBytes;
};

export const parseOptionalString = (
  value: unknown,
  label: string,
  maxLength: number,
) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `${label} must be a string.`,
      400,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `${label} is too long.`,
      400,
    );
  }
  return trimmed;
};

export const parseIsoDate = (value: unknown, label: string, fallback = new Date()) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `${label} must be an ISO date string.`,
      400,
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      `Invalid ${label}.`,
      400,
    );
  }
  return parsed;
};

export const parseClientRequestId = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 128) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_INVALID_INPUT,
      "clientRequestId must be 8-128 characters.",
      400,
    );
  }
  return value.trim();
};
