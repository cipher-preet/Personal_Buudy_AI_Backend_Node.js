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
  spaceId: mongoose.Types.ObjectId | null;
  startedAt: Date;
}) => {
  const now = new Date();
  await aiCollections().conversations.insertOne({
    _id: conversationId,
    userId,
    spaceId: spaceId ?? null,
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
  spaceId: mongoose.Types.ObjectId | null;
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
  const scopedSpaceId = spaceId ?? null;
  const audioResult = await aiCollections().audioChunks.updateOne(
    { conversationId, sequenceNumber: sequence },
    {
      $setOnInsert: {
        conversationId,
        userId,
        spaceId: scopedSpaceId,
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
        spaceId: scopedSpaceId,
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

/** Mark never-uploaded sequences as terminal so finalization can skip them. */
export const markMissingUploadSequencesTerminal = async ({
  conversationId,
  userId,
  spaceId,
  missingSequences,
}: {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  spaceId: mongoose.Types.ObjectId | null;
  missingSequences: number[];
}) => {
  if (!missingSequences.length) {
    return 0;
  }
  const now = new Date();
  const scopedSpaceId = spaceId ?? null;
  let marked = 0;
  for (const sequence of missingSequences) {
    const chunkId = `meeting:${String(conversationId)}:missing:${sequence}`;
    const result = await aiCollections().transcriptChunks.updateOne(
      { conversationId, sequenceNumber: sequence },
      {
        $setOnInsert: {
          conversationId,
          userId,
          spaceId: scopedSpaceId,
          chunkId,
          sequenceNumber: sequence,
          rawText: null,
          normalizedText: null,
          languageCode: null,
          sttProvider: "none",
          sttRequestId: null,
          sttStatus: "failed",
          processingStatus: "processed",
          startTimeMs: null,
          endTimeMs: null,
          audioFilePath: null,
          jobId: chunkId,
          sttAttempts: 0,
          retryCount: 0,
          lastError: "Chunk never uploaded before upload wait timeout.",
          failureStage: "upload",
          failureType: "MISSING_UPLOAD",
          terminal: true,
          archiveRef: null,
          processingWindowId: null,
          processedAt: now,
          publishedAt: null,
          exclusionReason: "sequence_missing",
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
    if (result.upsertedId || result.matchedCount > 0) {
      marked += 1;
    }
  }
  return marked;
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

const conversationScopedFilter = (conversationId: string) => {
  const id = idFilter(conversationId) as any;
  return {
    $or: [{ sourceConversationId: id }, { conversationId: id }],
    $and: [
      {
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
    ],
  };
};

const toIso = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const mapTaskDoc = (doc: Record<string, any>, staged: boolean) => {
  const operation = String(doc.operation || "").toUpperCase();
  let status = String(doc.status || "open").toLowerCase();
  if (operation === "COMPLETE" || status === "done" || status === "completed") {
    status = "done";
  } else if (operation === "CANCEL" || status === "blocked" || status === "cancelled") {
    status = "blocked";
  } else {
    status = "open";
  }

  return {
    id: String(doc._id),
    title: String(doc.title || "Untitled task"),
    body: String(doc.body || ""),
    owner: doc.ownerText ? String(doc.ownerText) : null,
    dueDate: doc.dueDateResolved || doc.dueDateText || doc.dueDate || null,
    status,
    operation: operation || null,
    confidence: typeof doc.confidence === "number" ? doc.confidence : null,
    staged,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
};

const mapNoteDoc = (doc: Record<string, any>, staged: boolean) => ({
  id: String(doc._id),
  title: String(doc.title || "Untitled note"),
  body: String(doc.body || ""),
  confidence: typeof doc.confidence === "number" ? doc.confidence : null,
  staged,
  createdAt: toIso(doc.createdAt),
  updatedAt: toIso(doc.updatedAt),
});

const mergeById = <T extends { id: string }>(preferred: T[], fallback: T[]) => {
  const map = new Map<string, T>();
  for (const item of fallback) {
    map.set(item.id, item);
  }
  for (const item of preferred) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
};

export const getConversationSummary = async (conversationId: string) => {
  const id = idFilter(conversationId) as any;
  const summary = await aiCollections().conversationSummaries.findOne({
    conversationId: id,
  });

  if (!summary) {
    return {
      meetingSessionId: conversationId,
      available: false,
      summary: null,
      topics: [] as string[],
      importantFacts: [] as string[],
      decisions: [] as string[],
      openQuestions: [] as string[],
      blockers: [] as string[],
      languageCodes: [] as string[],
      createdAt: null as string | null,
    };
  }

  const doc = summary as Record<string, any>;
  return {
    meetingSessionId: conversationId,
    available: true,
    summary: doc.summary ? String(doc.summary) : "",
    topics: Array.isArray(doc.topics) ? doc.topics.map(String) : [],
    importantFacts: Array.isArray(doc.importantFacts)
      ? doc.importantFacts.map(String)
      : [],
    decisions: Array.isArray(doc.decisions) ? doc.decisions.map(String) : [],
    openQuestions: Array.isArray(doc.openQuestions)
      ? doc.openQuestions.map(String)
      : [],
    blockers: Array.isArray(doc.blockers) ? doc.blockers.map(String) : [],
    languageCodes: Array.isArray(doc.languageCodes)
      ? doc.languageCodes.map(String)
      : [],
    createdAt: toIso(doc.createdAt),
  };
};

export const listConversationTasks = async (conversationId: string) => {
  const filter = conversationScopedFilter(conversationId);
  const [published, staged] = await Promise.all([
    aiCollections()
      .tasks.find({
        sourceConversationId: idFilter(conversationId) as any,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .sort({ createdAt: -1 })
      .toArray(),
    aiCollections()
      .stagedTasks.find(filter)
      .sort({ createdAt: -1 })
      .toArray(),
  ]);

  const items = mergeById(
    published.map((doc) => mapTaskDoc(doc as Record<string, any>, false)),
    staged.map((doc) => mapTaskDoc(doc as Record<string, any>, true)),
  );

  return {
    meetingSessionId: conversationId,
    items,
  };
};

export const listConversationNotes = async (conversationId: string) => {
  const filter = conversationScopedFilter(conversationId);
  const [published, staged] = await Promise.all([
    aiCollections()
      .notes.find({
        sourceConversationId: idFilter(conversationId) as any,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .sort({ createdAt: -1 })
      .toArray(),
    aiCollections()
      .stagedNotes.find(filter)
      .sort({ createdAt: -1 })
      .toArray(),
  ]);

  const items = mergeById(
    published.map((doc) => mapNoteDoc(doc as Record<string, any>, false)),
    staged.map((doc) => mapNoteDoc(doc as Record<string, any>, true)),
  );

  return {
    meetingSessionId: conversationId,
    items,
  };
};
