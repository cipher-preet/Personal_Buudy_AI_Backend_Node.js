import mongoose from "mongoose";

import {
  MeetingProvider,
  MeetingStatus,
  MEETING_SOURCE_TYPE,
  VideoMergeStatus,
} from "../constants.js";

const meetingSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Space",
      default: null,
      required: false,
    },
    provider: {
      type: String,
      enum: Object.values(MeetingProvider),
      default: MeetingProvider.UNKNOWN,
    },
    sourceType: {
      type: String,
      default: MEETING_SOURCE_TYPE,
    },
    status: {
      type: String,
      enum: Object.values(MeetingStatus),
      default: MeetingStatus.RECORDING,
      index: true,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    expectedFinalSequence: { type: Number, default: null },
    lastReceivedSequence: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 0 },
    uploadedChunks: { type: Number, default: 0 },
    processedChunks: { type: Number, default: 0 },
    failedChunks: { type: Number, default: 0 },
    totalBytes: { type: Number, default: 0 },
    recordingMimeType: { type: String, required: true },
    videoCodec: { type: String, default: null },
    audioCodec: { type: String, default: null },
    meetingUrl: { type: String, default: null },
    meetingTitle: { type: String, default: null },
    extensionVersion: { type: String, default: null },
    processingStatus: { type: String, default: "not_started" },
    transcriptStatus: { type: String, default: "pending" },
    intelligenceStatus: { type: String, default: "not_started" },
    videoMergeStatus: {
      type: String,
      enum: Object.values(VideoMergeStatus),
      default: VideoMergeStatus.NOT_STARTED,
    },
    finalRecordingS3Key: { type: String, default: null },
    mergeMissingSequences: { type: [Number], default: [] },
    mergePresentChunkCount: { type: Number, default: null },
    stopRequestedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    clientRequestId: { type: String, default: null },
    pipelineStopEnqueued: { type: Boolean, default: false },
    lastErrorCode: { type: String, default: null },
    lastErrorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "meeting_sessions",
  },
);

meetingSessionSchema.index({ userId: 1, createdAt: -1 });
meetingSessionSchema.index({ status: 1, updatedAt: 1 });
meetingSessionSchema.index(
  { userId: 1, clientRequestId: 1 },
  { unique: true, sparse: true },
);

export type MeetingSessionDocument = mongoose.InferSchemaType<
  typeof meetingSessionSchema
> & { _id: mongoose.Types.ObjectId };

export const MeetingSession =
  mongoose.models.MeetingSession ||
  mongoose.model("MeetingSession", meetingSessionSchema);
