const truthy = new Set(["1", "true", "yes", "on"]);

const readBool = (name: string, fallback: boolean) => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return truthy.has(raw);
};

const readInt = (name: string, fallback: number) => {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const isMeetingExtensionEnabled = () =>
  readBool("MEETING_EXTENSION_ENABLED", false);

export const getMeetingConfig = () => {
  const chunkMaxSizeMb = readInt("MEETING_CHUNK_MAX_SIZE_MB", 20);
  return {
    enabled: isMeetingExtensionEnabled(),
    chunkDurationMs: readInt("MEETING_CHUNK_DURATION_MS", 20_000),
    chunkMaxSizeBytes: chunkMaxSizeMb * 1024 * 1024,
    chunkMaxDurationMs: readInt("MEETING_CHUNK_MAX_DURATION_SECONDS", 60) * 1000,
    presignTtlSeconds: readInt("MEETING_UPLOAD_PRESIGN_TTL_SECONDS", 900),
    playbackTtlSeconds: readInt("MEETING_PLAYBACK_PRESIGN_TTL_SECONDS", 900),
    staleAfterMinutes: readInt("MEETING_RECORDING_STALE_AFTER_MINUTES", 180),
    // After STOP, wait this long for late chunk uploads before finalizing with gaps.
    uploadWaitTimeoutSeconds: readInt("MEETING_UPLOAD_WAIT_TIMEOUT_SECONDS", 180),
    sourceChunkRetentionDays: readInt("MEETING_SOURCE_CHUNK_RETENTION_DAYS", 7),
    videoFinalizationEnabled: readBool(
      "MEETING_VIDEO_FINALIZATION_ENABLED",
      true,
    ),
    s3Prefix: (process.env.MEETING_S3_PREFIX?.trim() || "meetings").replace(
      /^\/+|\/+$/g,
      "",
    ),
    // Same Redis instance + stream as mobile STT. Never the reminder Redis host.
    redisUrl: process.env.REDIS_URL?.trim() || "",
    meetingVideoStream:
      process.env.REDIS_STT_STREAM?.trim() || "buddy:stt:jobs",
    meetingMergeStream:
      process.env.REDIS_MEETING_MERGE_STREAM?.trim() ||
      "buddy:meeting:video-merge",
    finalizationStream:
      process.env.REDIS_FINALIZATION_STREAM?.trim() ||
      "buddy:conversation:finalization",
    queueApiBaseUrl: process.env.QUEUE_API_BASE_URL?.trim().replace(/\/$/, "") || "",
    queueApiServiceToken: process.env.QUEUE_API_SERVICE_TOKEN?.trim() || "",
    queueApiHmacSecret: process.env.QUEUE_API_HMAC_SECRET?.trim() || "",
    createRateLimitPerMinute: readInt(
      "MEETING_CREATE_RATE_LIMIT_PER_MINUTE",
      10,
    ),
    presignRateLimitPerMinute: readInt(
      "MEETING_PRESIGN_RATE_LIMIT_PER_MINUTE",
      60,
    ),
    maxTitleLength: 300,
    maxUrlLength: 2000,
    maxMissingSequencesInResponse: 200,
  };
};

export type MeetingConfig = ReturnType<typeof getMeetingConfig>;
