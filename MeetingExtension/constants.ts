export const MeetingMediaKind = {
  AUDIO: "audio",
  VIDEO: "video",
  MUXED: "muxed",
} as const;

export type MeetingMediaKind =
  (typeof MeetingMediaKind)[keyof typeof MeetingMediaKind];

export const DEFAULT_MEETINGS_SPACE_NAME = "Meetings";

export const MEETING_SOURCE_TYPE = "meeting_extension" as const;

export const MeetingProvider = {
  GOOGLE_MEET: "GOOGLE_MEET",
  ZOOM: "ZOOM",
  MICROSOFT_TEAMS: "MICROSOFT_TEAMS",
  UNKNOWN: "UNKNOWN",
} as const;

export type MeetingProvider =
  (typeof MeetingProvider)[keyof typeof MeetingProvider];

export const MeetingStatus = {
  CREATED: "CREATED",
  RECORDING: "RECORDING",
  STOP_REQUESTED: "STOP_REQUESTED",
  WAITING_FOR_UPLOADS: "WAITING_FOR_UPLOADS",
  UPLOAD_COMPLETE: "UPLOAD_COMPLETE",
  PROCESSING: "PROCESSING",
  WAITING_FOR_TRANSCRIPTS: "WAITING_FOR_TRANSCRIPTS",
  FINALIZING: "FINALIZING",
  READY: "READY",
  FAILED: "FAILED",
  INTERRUPTED: "INTERRUPTED",
  FINALIZATION_FAILED: "FINALIZATION_FAILED",
} as const;

export type MeetingStatus = (typeof MeetingStatus)[keyof typeof MeetingStatus];

export const ChunkUploadStatus = {
  PENDING: "PENDING",
  PRESIGNED: "PRESIGNED",
  UPLOADED: "UPLOADED",
  MISSING: "MISSING",
} as const;

export type ChunkUploadStatus =
  (typeof ChunkUploadStatus)[keyof typeof ChunkUploadStatus];

export const ChunkProcessingStatus = {
  PENDING: "PENDING",
  ENQUEUED: "ENQUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CORRUPT_MEDIA: "CORRUPT_MEDIA",
} as const;

export type ChunkProcessingStatus =
  (typeof ChunkProcessingStatus)[keyof typeof ChunkProcessingStatus];

export const ChunkTranscriptionStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  TRANSCRIPTION_FAILED: "TRANSCRIPTION_FAILED",
} as const;

export type ChunkTranscriptionStatus =
  (typeof ChunkTranscriptionStatus)[keyof typeof ChunkTranscriptionStatus];

export const VideoMergeStatus = {
  NOT_STARTED: "NOT_STARTED",
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type VideoMergeStatus =
  (typeof VideoMergeStatus)[keyof typeof VideoMergeStatus];

export const MeetingErrorCode = {
  MEETING_EXTENSION_UNAVAILABLE: "MEETING_EXTENSION_UNAVAILABLE",
  MEETING_NOT_FOUND: "MEETING_NOT_FOUND",
  MEETING_ACCESS_DENIED: "MEETING_ACCESS_DENIED",
  MEETING_INVALID_STATE: "MEETING_INVALID_STATE",
  MEETING_CHUNK_TOO_LARGE: "MEETING_CHUNK_TOO_LARGE",
  MEETING_INVALID_SEQUENCE: "MEETING_INVALID_SEQUENCE",
  MEETING_INVALID_MIME_TYPE: "MEETING_INVALID_MIME_TYPE",
  MEETING_CHUNK_NOT_FOUND_IN_S3: "MEETING_CHUNK_NOT_FOUND_IN_S3",
  MEETING_CHUNK_ALREADY_FINALIZED: "MEETING_CHUNK_ALREADY_FINALIZED",
  MEETING_UPLOAD_PRESIGN_FAILED: "MEETING_UPLOAD_PRESIGN_FAILED",
  MEETING_PROCESSING_FAILED: "MEETING_PROCESSING_FAILED",
  MEETING_AUDIO_EXTRACTION_FAILED: "MEETING_AUDIO_EXTRACTION_FAILED",
  MEETING_STT_FAILED: "MEETING_STT_FAILED",
  MEETING_FINALIZATION_FAILED: "MEETING_FINALIZATION_FAILED",
  MEETING_INVALID_INPUT: "MEETING_INVALID_INPUT",
  MEETING_SPACE_NOT_FOUND: "MEETING_SPACE_NOT_FOUND",
  MEETING_RATE_LIMITED: "MEETING_RATE_LIMITED",
  MEETING_PLAYBACK_NOT_READY: "MEETING_PLAYBACK_NOT_READY",
  MEETING_S3_NOT_CONFIGURED: "MEETING_S3_NOT_CONFIGURED",
  MEETING_ZERO_BYTE_CHUNK: "MEETING_ZERO_BYTE_CHUNK",
} as const;

export type MeetingErrorCode =
  (typeof MeetingErrorCode)[keyof typeof MeetingErrorCode];

export const ALLOWED_UPLOAD_STATUSES: ReadonlySet<MeetingStatus> = new Set([
  MeetingStatus.RECORDING,
  MeetingStatus.STOP_REQUESTED,
  MeetingStatus.WAITING_FOR_UPLOADS,
  MeetingStatus.INTERRUPTED,
]);

export const TERMINAL_REJECT_UPLOAD_STATUSES: ReadonlySet<MeetingStatus> =
  new Set([
    MeetingStatus.UPLOAD_COMPLETE,
    MeetingStatus.PROCESSING,
    MeetingStatus.WAITING_FOR_TRANSCRIPTS,
    MeetingStatus.FINALIZING,
    MeetingStatus.READY,
    MeetingStatus.FAILED,
    MeetingStatus.FINALIZATION_FAILED,
  ]);

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
]);

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/webm",
  "video/mp4",
]);

export const ALLOWED_MIME_TYPES = new Set([
  ...ALLOWED_AUDIO_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
]);
