import mongoose from "mongoose";

import { MeetingRecordingChunk } from "../Modals/MeetingRecordingChunk.Modal.js";
import type { ChunkUploadStatus, MeetingMediaKind } from "../constants.js";

let legacyChunkIndexDropped = false;

export const ensureMeetingChunkIndexes = async () => {
  if (legacyChunkIndexDropped) {
    return;
  }
  try {
    await MeetingRecordingChunk.collection.dropIndex("meetingSessionId_1_sequence_1");
  } catch {
    // Fresh databases never had the old unique index.
  } finally {
    legacyChunkIndexDropped = true;
  }
};

export const buildPresignChunkUpdate = (fields: {
  meetingSessionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sequence: number;
  mediaKind: MeetingMediaKind;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  s3Key: string;
  uploadStatus: ChunkUploadStatus;
}) => ({
  filter: {
    meetingSessionId: fields.meetingSessionId,
    sequence: fields.sequence,
    mediaKind: fields.mediaKind,
  },
  update: {
    $setOnInsert: {
      meetingSessionId: fields.meetingSessionId,
      userId: fields.userId,
      sequence: fields.sequence,
      mediaKind: fields.mediaKind,
      processingEnqueued: false,
    },
    $set: {
      startOffsetMs: fields.startOffsetMs,
      endOffsetMs: fields.endOffsetMs,
      durationMs: fields.durationMs,
      sizeBytes: fields.sizeBytes,
      mimeType: fields.mimeType,
      s3Key: fields.s3Key,
      uploadStatus: fields.uploadStatus,
    },
  },
});

export const upsertPresignedChunk = async (fields: {
  meetingSessionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sequence: number;
  mediaKind: MeetingMediaKind;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  s3Key: string;
  uploadStatus: ChunkUploadStatus;
}) => {
  const { filter, update } = buildPresignChunkUpdate(fields);
  return MeetingRecordingChunk.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
  });
};

const muxedOrLegacy = (mediaKind: MeetingMediaKind) =>
  mediaKind === "muxed"
    ? { $or: [{ mediaKind: "muxed" }, { mediaKind: { $exists: false } }, { mediaKind: null }] }
    : { mediaKind };

export const findChunk = async (
  meetingSessionId: mongoose.Types.ObjectId,
  sequence: number,
  mediaKind: MeetingMediaKind,
) => {
  return MeetingRecordingChunk.findOne({
    meetingSessionId,
    sequence,
    ...muxedOrLegacy(mediaKind),
  });
};

export const markChunkUploadedOnce = async ({
  meetingSessionId,
  sequence,
  mediaKind,
  etag,
  sizeBytes,
  startOffsetMs,
  endOffsetMs,
  durationMs,
  jobId,
}: {
  meetingSessionId: mongoose.Types.ObjectId;
  sequence: number;
  mediaKind: MeetingMediaKind;
  etag?: string | null;
  sizeBytes: number;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  jobId: string;
}) => {
  const now = new Date();
  const claimed = await MeetingRecordingChunk.findOneAndUpdate(
    {
      meetingSessionId,
      sequence,
      processingEnqueued: { $ne: true },
      ...muxedOrLegacy(mediaKind),
    },
    {
      $set: {
        uploadStatus: "UPLOADED",
        processingStatus: mediaKind === "video" ? "COMPLETED" : "ENQUEUED",
        transcriptionStatus: mediaKind === "video" ? "COMPLETED" : "PENDING",
        processingEnqueued: true,
        etag: etag ?? null,
        sizeBytes,
        startOffsetMs,
        endOffsetMs,
        durationMs,
        uploadedAt: now,
        jobId,
      },
    },
    { new: true },
  );
  if (claimed) {
    return { chunk: claimed, enqueuedNow: true as const };
  }
  const existing = await MeetingRecordingChunk.findOne({
    meetingSessionId,
    sequence,
    ...muxedOrLegacy(mediaKind),
  });
  return { chunk: existing, enqueuedNow: false as const };
};

export const listUploadedSequences = async (
  meetingSessionId: mongoose.Types.ObjectId,
  mediaKinds?: MeetingMediaKind[],
) => {
  const query: Record<string, unknown> = {
    meetingSessionId,
    uploadStatus: "UPLOADED",
  };
  if (mediaKinds?.length) {
    query.mediaKind = { $in: mediaKinds };
  }
  const rows = await MeetingRecordingChunk.find(query)
    .select({ sequence: 1, sizeBytes: 1, mediaKind: 1 })
    .lean();
  return rows;
};

export const countChunksBySession = async (
  meetingSessionId: mongoose.Types.ObjectId,
) => {
  const [uploaded, processed, failed] = await Promise.all([
    MeetingRecordingChunk.countDocuments({
      meetingSessionId,
      uploadStatus: "UPLOADED",
    }),
    MeetingRecordingChunk.countDocuments({
      meetingSessionId,
      processingStatus: "COMPLETED",
    }),
    MeetingRecordingChunk.countDocuments({
      meetingSessionId,
      processingStatus: { $in: ["FAILED", "CORRUPT_MEDIA"] },
    }),
  ]);
  return { uploaded, processed, failed };
};
