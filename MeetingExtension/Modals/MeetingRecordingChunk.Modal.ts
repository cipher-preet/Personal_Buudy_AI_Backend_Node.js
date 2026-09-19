import mongoose from "mongoose";

import {
  ChunkProcessingStatus,
  ChunkTranscriptionStatus,
  ChunkUploadStatus,
} from "../constants.js";

const meetingRecordingChunkSchema = new mongoose.Schema(
  {
    meetingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sequence: { type: Number, required: true },
    startOffsetMs: { type: Number, required: true },
    endOffsetMs: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true },
    mediaKind: {
      type: String,
      enum: ["audio", "video", "muxed"],
      default: "muxed",
    },
    s3Key: { type: String, required: true },
    uploadStatus: {
      type: String,
      enum: Object.values(ChunkUploadStatus),
      default: ChunkUploadStatus.PRESIGNED,
    },
    processingStatus: {
      type: String,
      enum: Object.values(ChunkProcessingStatus),
      default: ChunkProcessingStatus.PENDING,
    },
    transcriptionStatus: {
      type: String,
      enum: Object.values(ChunkTranscriptionStatus),
      default: ChunkTranscriptionStatus.PENDING,
    },
    retryCount: { type: Number, default: 0 },
    checksum: { type: String, default: null },
    etag: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    failureCode: { type: String, default: null },
    failureMessage: { type: String, default: null },
    processingEnqueued: { type: Boolean, default: false },
    jobId: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "meeting_recording_chunks",
  },
);

meetingRecordingChunkSchema.index(
  { meetingSessionId: 1, sequence: 1, mediaKind: 1 },
  { unique: true },
);
meetingRecordingChunkSchema.index({ meetingSessionId: 1, processingStatus: 1 });
meetingRecordingChunkSchema.index({ processingStatus: 1, updatedAt: 1 });

export type MeetingRecordingChunkDocument = mongoose.InferSchemaType<
  typeof meetingRecordingChunkSchema
> & { _id: mongoose.Types.ObjectId };

export const MeetingRecordingChunk =
  mongoose.models.MeetingRecordingChunk ||
  mongoose.model("MeetingRecordingChunk", meetingRecordingChunkSchema);
