import mongoose from "mongoose";

import { MEETING_SOURCE_TYPE } from "../constants.js";

const idFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }
  return { $in: [id, new mongoose.Types.ObjectId(id)] };
};

export const aiCollections = () => {
  const db = mongoose.connection;
  return {
    conversations: db.collection("conversations"),
    audioChunks: db.collection("audio_chunks"),
    transcriptChunks: db.collection("transcript_chunks"),
    extractionRuns: db.collection("extraction_runs"),
    tasks: db.collection("tasks"),
    notes: db.collection("notes"),
    stagedTasks: db.collection("stagedTasks"),
    stagedNotes: db.collection("stagedNotes"),
    conversationSummaries: db.collection("conversation_summaries"),
  };
};

export const insertConversationForMeeting = async ({
  conversationId,
  userId,
  spaceId,
  startedAt,
}: {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  spaceId: mongoose.Types.ObjectId;
  startedAt: Date;
}) => {
  const now = new Date();
  await aiCollections().conversations.insertOne({
    _id: conversationId,
    userId,
    spaceId,
    status: "RECORDING",
    sourceType: MEETING_SOURCE_TYPE,
    startedAt,
    stoppedAt: null,
    stoppedAtClient: null,
    expectedLastSequence: null,
    receivedAudioChunkCount: 0,
    completedTranscriptChunkCount: 0,
    failedTranscriptChunkCount: 0,
    processingVersion: 1,
    activeExtractionRunId: null,
    missingSequences: [],
    lastError: null,
    lastActivityAt: now,
    processedAt: null,
    finalizationAttempts: 0,
    lastAccounting: {},
    createdAt: now,
    updatedAt: now,
  });
};

export const upsertPendingMediaRows = async ({
  conversationId,
  userId,
  spaceId,
  sequence,
  chunkId,
  s3Key,
  bucket,
  mimeType,
  sizeBytes,
  durationMs,
  startOffsetMs,
  endOffsetMs,
}: {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  spaceId: mongoose.Types.ObjectId;
  sequence: number;
  chunkId: string;
  s3Key: string;
  bucket: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  startOffsetMs: number;
  endOffsetMs: number;
}) => {
  const now = new Date();
  const filePath = `s3://${bucket}/${s3Key}`;
  const audioResult = await aiCollections().audioChunks.updateOne(
    { conversationId, sequenceNumber: sequence },
    {
      $setOnInsert: {
        conversationId,
        userId,
        spaceId,
        chunkId,
        sequenceNumber: sequence,
        capturedAt: now,
        durationMs,
        filePath,
        filename: `${chunkId}.webm`,
        contentType: mimeType,
        storageProvider: "s3",
        s3Bucket: bucket,
        s3ObjectKey: s3Key,
        sizeBytes,
        jobId: chunkId,
        sourceType: MEETING_SOURCE_TYPE,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  const inserted = Boolean(audioResult.upsertedId);
  if (inserted) {
    await aiCollections().conversations.updateOne(
      { _id: conversationId },
      {
        $inc: { receivedAudioChunkCount: 1 },
        $set: { lastActivityAt: now, updatedAt: now },
      },
    );
  }

  await aiCollections().transcriptChunks.updateOne(
    { conversationId, sequenceNumber: sequence },
    {
      $setOnInsert: {
        conversationId,
        userId,
        spaceId,
        chunkId,
        sequenceNumber: sequence,
        rawText: null,
        normalizedText: null,
        languageCode: null,
        sttProvider: "sarvam",
        sttRequestId: null,
        sttStatus: "pending",
        processingStatus: "unprocessed",
        startTimeMs: startOffsetMs,
        endTimeMs: endOffsetMs,
        audioFilePath: filePath,
        jobId: chunkId,
        sttAttempts: 0,
        retryCount: 0,
        lastError: null,
        failureStage: null,
        failureType: null,
        terminal: false,
        archiveRef: null,
        processingWindowId: null,
        processedAt: null,
        publishedAt: null,
        exclusionReason: null,
        sourceType: MEETING_SOURCE_TYPE,
        source: MEETING_SOURCE_TYPE,
        meetingSessionId: String(conversationId),
        segments: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      },
    },
    { upsert: true },
  );

  return inserted;
};

export const markConversationStopRequested = async ({
  conversationId,
  expectedLastSequence,
  stoppedAt,
}: {
  conversationId: mongoose.Types.ObjectId;
  expectedLastSequence: number;
  stoppedAt: Date;
}) => {
  const now = new Date();
  const result = await aiCollections().conversations.updateOne(
    {
      _id: conversationId,
      status: { $in: ["RECORDING", "STOP_REQUESTED"] },
    },
    {
      $set: {
        status: "STOP_REQUESTED",
        expectedLastSequence,
        stoppedAt,
        lastActivityAt: now,
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount > 0 || result.matchedCount > 0;
};

export const getConversation = async (conversationId: string) => {
  return aiCollections().conversations.findOne({
    _id: idFilter(conversationId) as any,
  });
};

export const listTranscriptChunks = async (conversationId: string) => {
  return aiCollections()
    .transcriptChunks.find({ conversationId: idFilter(conversationId) as any })
    .sort({ startTimeMs: 1, sequenceNumber: 1 })
    .toArray();
};

export const getArtifactCounts = async (conversationId: string) => {
  const id = idFilter(conversationId) as any;
  const [tasks, notes, stagedTasks, stagedNotes, summary] = await Promise.all([
    aiCollections().tasks.countDocuments({ sourceConversationId: id }),
    aiCollections().notes.countDocuments({ sourceConversationId: id }),
    aiCollections().stagedTasks.countDocuments({
      $or: [{ sourceConversationId: id }, { conversationId: id }],
    }),
    aiCollections().stagedNotes.countDocuments({
      $or: [{ sourceConversationId: id }, { conversationId: id }],
    }),
    aiCollections().conversationSummaries.findOne({ conversationId: id }),
  ]);
  return {
    taskCount: tasks + stagedTasks,
    noteCount: notes + stagedNotes,
    hasSummary: Boolean(summary),
  };
};
