import mongoose from "mongoose";

import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  getSharedS3Bucket,
  hasSharedS3Config,
  headS3Object,
} from "../../Config/s3.js";
import { getMeetingConfig } from "../config.js";
import {
  ChunkUploadStatus,
  MeetingErrorCode,
  MeetingMediaKind,
  MeetingStatus,
  MEETING_SOURCE_TYPE,
  VideoMergeStatus,
} from "../constants.js";
import { MeetingError } from "../errors.js";
import { logMeetingEvent } from "../log.js";
import {
  getArtifactCounts,
  getConversation,
  insertConversationForMeeting,
  listTranscriptChunks,
  markConversationStopRequested,
  upsertPendingMediaRows,
} from "../Modals/sharedAiCollections.js";
import { buildEnvelope, publishMeetingEvent } from "../queue.js";
import { allowRateLimit } from "../rateLimit.js";
import {
  countChunksBySession,
  ensureMeetingChunkIndexes,
  findChunk,
  listUploadedSequences,
  markChunkUploadedOnce,
  upsertPresignedChunk,
} from "../Repository/MeetingChunk.repository.js";
import {
  createMeetingSession,
  findMeetingByClientRequestId,
  findMeetingById,
  listMeetingsForUser,
  markStaleMeetings,
  resolveSpaceForMeetingUser,
} from "../Repository/MeetingSession.repository.js";
import { buildChunkId, buildFinalRecordingS3Key, buildMeetingChunkS3Key } from "../s3Keys.js";
import { canAcceptUploads, missingSequences, toClientStatus } from "../state.js";
import { flattenTranscriptSegments } from "../transcript.js";
import {
  assertAllowedMimeType,
  parseChunkTiming,
  parseClientRequestId,
  parseIsoDate,
  parseMediaKind,
  parseNonNegativeInt,
  parseObjectId,
  parseOptionalObjectId,
  parseOptionalString,
  parseProvider,
  parseSequence,
  parseSizeBytes,
} from "../validation.js";

export type S3Port = {
  hasConfig: () => boolean;
  bucket: () => string | undefined;
  presignPut: typeof createPresignedPutUrl;
  presignGet: typeof createPresignedGetUrl;
  head: typeof headS3Object;
};

export type QueuePort = {
  publish: typeof publishMeetingEvent;
};

const defaultS3: S3Port = {
  hasConfig: hasSharedS3Config,
  bucket: getSharedS3Bucket,
  presignPut: createPresignedPutUrl,
  presignGet: createPresignedGetUrl,
  head: headS3Object,
};

const defaultQueue: QueuePort = {
  publish: publishMeetingEvent,
};

const requireUserId = (userId?: string) => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_ACCESS_DENIED,
      "Authenticated user is required.",
      401,
    );
  }
  return userId;
};

const requireOwnedMeeting = async (userId: string, meetingSessionId: string) => {
  const meeting = await findMeetingById(meetingSessionId);
  if (!meeting) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_NOT_FOUND,
      "Meeting not found.",
      404,
    );
  }
  if (String(meeting.userId) !== String(userId)) {
    throw new MeetingError(
      MeetingErrorCode.MEETING_ACCESS_DENIED,
      "Meeting does not belong to this user.",
      403,
    );
  }
  return meeting;
};

const refreshChunkCounters = async (meeting: mongoose.Document & Record<string, any>) => {
  const counts = await countChunksBySession(meeting._id);
  meeting.uploadedChunks = counts.uploaded;
  meeting.processedChunks = counts.processed;
  meeting.failedChunks = counts.failed;
  meeting.totalChunks = Math.max(meeting.totalChunks || 0, counts.uploaded);
};

export class MeetingRecordingService {
  constructor(
    private readonly s3: S3Port = defaultS3,
    private readonly queue: QueuePort = defaultQueue,
  ) {}

  async create(userId: string | undefined, body: Record<string, unknown>) {
    const ownerId = requireUserId(userId);
    const config = getMeetingConfig();
    await ensureMeetingChunkIndexes();
    if (
      !allowRateLimit(
        `meeting-create:${ownerId}`,
        config.createRateLimitPerMinute,
      )
    ) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_RATE_LIMITED,
        "Too many meeting create requests.",
        429,
      );
    }

    const requestedSpaceId = parseOptionalObjectId(body.spaceId, "spaceId");
    const space = await resolveSpaceForMeetingUser(ownerId, requestedSpaceId);
    if (!space) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_SPACE_NOT_FOUND,
        "Space not found for this user.",
        404,
      );
    }
    const spaceId = String(space._id);

    const clientRequestId = parseClientRequestId(body.clientRequestId);
    if (clientRequestId) {
      const existing = await findMeetingByClientRequestId(ownerId, clientRequestId);
      if (existing) {
        return this.toCreateResponse(existing, config.chunkDurationMs);
      }
    }

    const mimeType = assertAllowedMimeType(
      body.recordingMimeType || "video/webm",
    );
    const startedAt = parseIsoDate(body.startedAt, "startedAt");
    const meetingSessionId = new mongoose.Types.ObjectId();
    const userObjectId = new mongoose.Types.ObjectId(ownerId);
    const spaceObjectId = new mongoose.Types.ObjectId(spaceId);

    await insertConversationForMeeting({
      conversationId: meetingSessionId,
      userId: userObjectId,
      spaceId: spaceObjectId,
      startedAt,
    });

    const meeting = await createMeetingSession({
      _id: meetingSessionId,
      userId: userObjectId,
      spaceId: spaceObjectId,
      provider: parseProvider(body.provider),
      sourceType: MEETING_SOURCE_TYPE,
      status: MeetingStatus.RECORDING,
      startedAt,
      recordingMimeType: mimeType,
      meetingUrl: parseOptionalString(body.meetingUrl, "meetingUrl", config.maxUrlLength),
      meetingTitle: parseOptionalString(
        body.meetingTitle,
        "meetingTitle",
        config.maxTitleLength,
      ),
      extensionVersion: parseOptionalString(
        body.extensionVersion,
        "extensionVersion",
        64,
      ),
      clientRequestId: clientRequestId || null,
    });

    logMeetingEvent("meeting_session_created", {
      meetingSessionId: String(meeting._id),
      userId: ownerId,
      status: meeting.status,
    });

    return this.toCreateResponse(meeting, config.chunkDurationMs);
  }

  async presign(
    userId: string | undefined,
    meetingSessionId: string,
    body: Record<string, unknown>,
  ) {
    const ownerId = requireUserId(userId);
    const config = getMeetingConfig();
    await ensureMeetingChunkIndexes();
    if (
      !allowRateLimit(
        `meeting-presign:${ownerId}`,
        config.presignRateLimitPerMinute,
      )
    ) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_RATE_LIMITED,
        "Too many presign requests.",
        429,
      );
    }
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    if (!canAcceptUploads(meeting.status as MeetingStatus)) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_INVALID_STATE,
        "Meeting is not accepting new chunk uploads.",
        409,
        { status: meeting.status },
      );
    }

    const sequence = parseSequence(body.sequence);
    this.assertSequenceAllowed(meeting, sequence);

    const mimeType = assertAllowedMimeType(body.mimeType || meeting.recordingMimeType);
    const mediaKind = parseMediaKind(body.mediaKind, mimeType);
    const timing = parseChunkTiming(body, config);
    const sizeBytes = parseSizeBytes(body.sizeBytes, config);
    const s3Key = buildMeetingChunkS3Key({
      prefix: config.s3Prefix,
      userId: ownerId,
      meetingSessionId: String(meeting._id),
      sequence,
      mimeType,
      mediaKind,
    });

    if (!this.s3.hasConfig()) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_S3_NOT_CONFIGURED,
        "S3 is not configured.",
        503,
      );
    }

    let signed;
    try {
      signed = await this.s3.presignPut({
        key: s3Key,
        contentType: mimeType,
        expiresInSeconds: config.presignTtlSeconds,
      });
    } catch {
      throw new MeetingError(
        MeetingErrorCode.MEETING_UPLOAD_PRESIGN_FAILED,
        "Failed to create upload URL.",
        502,
      );
    }

    await upsertPresignedChunk({
      meetingSessionId: meeting._id,
      userId: meeting.userId,
      sequence,
      mediaKind,
      startOffsetMs: timing.startOffsetMs,
      endOffsetMs: timing.endOffsetMs,
      durationMs: timing.durationMs,
      sizeBytes,
      mimeType,
      s3Key,
      uploadStatus: ChunkUploadStatus.PRESIGNED,
    });

    logMeetingEvent("meeting_chunk_presigned", {
      meetingSessionId: String(meeting._id),
      userId: ownerId,
      chunkSequence: sequence,
      mediaKind,
    });

    return {
      uploadUrl: signed.uploadUrl,
      s3Key,
      mediaKind,
      expiresAt: signed.expiresAt.toISOString(),
      method: "PUT",
      headers: { "Content-Type": mimeType },
    };
  }

  async complete(
    userId: string | undefined,
    meetingSessionId: string,
    sequenceRaw: string,
    body: Record<string, unknown>,
  ) {
    const ownerId = requireUserId(userId);
    const config = getMeetingConfig();
    await ensureMeetingChunkIndexes();
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    const sequence = parseSequence(sequenceRaw);
    const mimeHint = body.mimeType
      ? assertAllowedMimeType(body.mimeType)
      : String(meeting.recordingMimeType || "video/webm");
    const mediaKind = parseMediaKind(body.mediaKind, mimeHint);
    const existing = await findChunk(meeting._id, sequence, mediaKind);
    const mimeType = existing?.mimeType || mimeHint;
    const expectedKey = buildMeetingChunkS3Key({
      prefix: config.s3Prefix,
      userId: ownerId,
      meetingSessionId: String(meeting._id),
      sequence,
      mimeType,
      mediaKind,
    });

    if (!canAcceptUploads(meeting.status as MeetingStatus) && existing?.uploadStatus !== "UPLOADED") {
      throw new MeetingError(
        MeetingErrorCode.MEETING_INVALID_STATE,
        "Meeting is not accepting new chunk uploads.",
        409,
        { status: meeting.status },
      );
    }
    this.assertSequenceAllowed(meeting, sequence);

    const providedKey = parseOptionalString(body.s3Key, "s3Key", 1024);
    if (providedKey && providedKey !== expectedKey) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_ACCESS_DENIED,
        "s3Key does not match the server-generated key.",
        403,
      );
    }

    const timing = parseChunkTiming(
      {
        startOffsetMs: body.startOffsetMs ?? existing?.startOffsetMs,
        endOffsetMs: body.endOffsetMs ?? existing?.endOffsetMs,
        durationMs: body.durationMs ?? existing?.durationMs,
      },
      config,
    );
    const sizeBytes = parseSizeBytes(body.sizeBytes ?? existing?.sizeBytes, config);

    if (!this.s3.hasConfig()) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_S3_NOT_CONFIGURED,
        "S3 is not configured.",
        503,
      );
    }

    let head;
    try {
      head = await this.s3.head(expectedKey);
    } catch {
      throw new MeetingError(
        MeetingErrorCode.MEETING_CHUNK_NOT_FOUND_IN_S3,
        "Uploaded object was not found in S3.",
        404,
      );
    }

    if (!head.sizeBytes || head.sizeBytes <= 0) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_ZERO_BYTE_CHUNK,
        "Uploaded object is empty.",
        400,
      );
    }
    if (head.sizeBytes > config.chunkMaxSizeBytes) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_CHUNK_TOO_LARGE,
        "Uploaded object exceeds configured size limit.",
        400,
      );
    }

    const chunkId = buildChunkId(String(meeting._id), sequence, mediaKind);
    await upsertPresignedChunk({
      meetingSessionId: meeting._id,
      userId: meeting.userId,
      sequence,
      mediaKind,
      startOffsetMs: timing.startOffsetMs,
      endOffsetMs: timing.endOffsetMs,
      durationMs: timing.durationMs,
      sizeBytes: head.sizeBytes,
      mimeType,
      s3Key: expectedKey,
      uploadStatus: ChunkUploadStatus.PRESIGNED,
    });

    const bucket = this.s3.bucket() || "";
    const followsAudioPath =
      mediaKind === MeetingMediaKind.AUDIO || mediaKind === MeetingMediaKind.MUXED;

    if (followsAudioPath) {
      await upsertPendingMediaRows({
        conversationId: meeting._id,
        userId: meeting.userId,
        spaceId: meeting.spaceId,
        sequence,
        chunkId,
        s3Key: expectedKey,
        bucket,
        mimeType,
        sizeBytes: head.sizeBytes,
        durationMs: timing.durationMs,
        startOffsetMs: timing.startOffsetMs,
        endOffsetMs: timing.endOffsetMs,
      });
    }

    if (followsAudioPath && !existing?.processingEnqueued) {
      try {
        await this.queue.publish(
          config.meetingVideoStream,
          buildEnvelope({
            eventId: `${chunkId}:ready`,
            eventType: "meeting.video.chunk.ready",
            userId: ownerId,
            spaceId: String(meeting.spaceId),
            conversationId: String(meeting._id),
            payload: {
              jobType: "meeting_video_chunk_ready",
              meetingSessionId: String(meeting._id),
              chunkId,
              sequence,
              sequenceNumber: sequence,
              mediaKind,
              userId: ownerId,
              spaceId: String(meeting.spaceId),
              s3Key: expectedKey,
              s3Bucket: bucket,
              startOffsetMs: timing.startOffsetMs,
              endOffsetMs: timing.endOffsetMs,
              durationMs: timing.durationMs,
              sourceType: MEETING_SOURCE_TYPE,
              startedAt: meeting.startedAt?.toISOString?.() || meeting.startedAt,
              mimeType,
            },
          }),
        );
      } catch {
        throw new MeetingError(
          MeetingErrorCode.MEETING_PROCESSING_FAILED,
          "Failed to enqueue meeting processing.",
          503,
        );
      }
      logMeetingEvent("meeting_chunk_job_enqueued", {
        meetingSessionId: String(meeting._id),
        userId: ownerId,
        chunkSequence: sequence,
        mediaKind,
        jobId: chunkId,
      });
    }

    const claimed = await markChunkUploadedOnce({
      meetingSessionId: meeting._id,
      sequence,
      mediaKind,
      etag: typeof body.etag === "string" ? body.etag : head.etag,
      sizeBytes: head.sizeBytes,
      startOffsetMs: timing.startOffsetMs,
      endOffsetMs: timing.endOffsetMs,
      durationMs: timing.durationMs,
      jobId: chunkId,
    });

    meeting.lastReceivedSequence = Math.max(meeting.lastReceivedSequence || 0, sequence);
    meeting.totalBytes = (meeting.totalBytes || 0) + (claimed.enqueuedNow ? head.sizeBytes : 0);
    await refreshChunkCounters(meeting);
    if (
      meeting.status === MeetingStatus.STOP_REQUESTED ||
      meeting.status === MeetingStatus.WAITING_FOR_UPLOADS
    ) {
      await this.maybeAdvanceAfterUploads(meeting, config);
    } else {
      await meeting.save();
    }

    logMeetingEvent("meeting_chunk_registered", {
      meetingSessionId: String(meeting._id),
      userId: ownerId,
      chunkSequence: sequence,
      mediaKind,
      status: meeting.status,
    });

    return {
      meetingSessionId: String(meeting._id),
      sequence,
      mediaKind,
      uploadStatus: "UPLOADED",
      processingStatus:
        claimed.chunk?.processingStatus ||
        (followsAudioPath ? "ENQUEUED" : "COMPLETED"),
      duplicate: !claimed.enqueuedNow,
      status: meeting.status,
    };
  }

  async stop(
    userId: string | undefined,
    meetingSessionId: string,
    body: Record<string, unknown>,
  ) {
    const ownerId = requireUserId(userId);
    const config = getMeetingConfig();
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    const finalSequence = parseSequence(body.finalSequence);
    const durationMs = parseNonNegativeInt(body.durationMs, "durationMs", false);
    const endedAt = parseIsoDate(body.endedAt, "endedAt");

    if (
      meeting.status === MeetingStatus.READY ||
      meeting.status === MeetingStatus.FINALIZING ||
      meeting.status === MeetingStatus.PROCESSING ||
      meeting.status === MeetingStatus.WAITING_FOR_TRANSCRIPTS ||
      meeting.status === MeetingStatus.UPLOAD_COMPLETE
    ) {
      return this.toStopResponse(meeting, [], []);
    }

    meeting.expectedFinalSequence = finalSequence;
    meeting.durationMs = durationMs ?? meeting.durationMs;
    meeting.endedAt = endedAt;
    meeting.stopRequestedAt = meeting.stopRequestedAt || new Date();
    if (
      meeting.status === MeetingStatus.RECORDING ||
      meeting.status === MeetingStatus.INTERRUPTED
    ) {
      meeting.status = MeetingStatus.STOP_REQUESTED;
    }

    logMeetingEvent("meeting_stop_requested", {
      meetingSessionId: String(meeting._id),
      userId: ownerId,
      status: meeting.status,
    });

    return this.maybeAdvanceAfterUploads(meeting, config);
  }

  async list(userId: string | undefined, query: Record<string, unknown>) {
    const ownerId = requireUserId(userId);
    const limitRaw = Number.parseInt(String(query.limit || "20"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
    const page = await listMeetingsForUser({ userId: ownerId, limit, cursor });
    return {
      items: page.items.map((item: Record<string, any>) => this.toDetail(item)),
      nextCursor: page.nextCursor,
    };
  }

  async get(userId: string | undefined, meetingSessionId: string) {
    const ownerId = requireUserId(userId);
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    const conversation = await getConversation(String(meeting._id));
    const artifacts = await getArtifactCounts(String(meeting._id));
    await this.syncFromConversation(meeting, conversation);
    return {
      ...this.toDetail(meeting.toObject()),
      artifacts,
      conversationStatus: conversation?.status || null,
    };
  }

  async getTranscript(userId: string | undefined, meetingSessionId: string) {
    const ownerId = requireUserId(userId);
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    const chunks = await listTranscriptChunks(String(meeting._id));
    const segments = flattenTranscriptSegments(chunks, meeting.startedAt);
    return {
      meetingSessionId: String(meeting._id),
      durationMs: meeting.durationMs,
      segments,
    };
  }

  async getPlayback(userId: string | undefined, meetingSessionId: string) {
    const ownerId = requireUserId(userId);
    const meeting = await requireOwnedMeeting(ownerId, parseObjectId(meetingSessionId, "sessionId"));
    if (!meeting.finalRecordingS3Key) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_PLAYBACK_NOT_READY,
        "Final recording is not available yet.",
        409,
        {
          recordingAvailable: false,
          videoMergeStatus: meeting.videoMergeStatus,
        },
      );
    }
    const config = getMeetingConfig();
    const signed = await this.s3.presignGet({
      key: meeting.finalRecordingS3Key,
      expiresInSeconds: config.playbackTtlSeconds,
    });
    return {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      s3Key: meeting.finalRecordingS3Key,
    };
  }

  async scanStaleSessions() {
    const config = getMeetingConfig();
    const cutoff = new Date(Date.now() - config.staleAfterMinutes * 60_000);
    return markStaleMeetings({
      cutoff,
      statuses: [
        MeetingStatus.RECORDING,
        MeetingStatus.STOP_REQUESTED,
        MeetingStatus.WAITING_FOR_UPLOADS,
      ],
    });
  }

  private assertSequenceAllowed(meeting: { expectedFinalSequence?: number | null; status: string }, sequence: number) {
    if (
      meeting.expectedFinalSequence != null &&
      sequence > meeting.expectedFinalSequence
    ) {
      throw new MeetingError(
        MeetingErrorCode.MEETING_INVALID_SEQUENCE,
        "sequence is greater than expectedFinalSequence.",
        400,
      );
    }
  }

  private async maybeAdvanceAfterUploads(
    meeting: mongoose.Document & Record<string, any>,
    config: ReturnType<typeof getMeetingConfig>,
  ) {
    const expected = meeting.expectedFinalSequence;
    const uploaded = await listUploadedSequences(meeting._id);
    const kindOf = (row: { mediaKind?: string | null }) =>
      row.mediaKind || MeetingMediaKind.MUXED;
    const audioSeqs = uploaded
      .filter(
        (row: { mediaKind?: string | null }) =>
          kindOf(row) === MeetingMediaKind.AUDIO || kindOf(row) === MeetingMediaKind.MUXED,
      )
      .map((row: { sequence: number }) => row.sequence);
    const videoSeqs = uploaded
      .filter(
        (row: { mediaKind?: string | null }) =>
          kindOf(row) === MeetingMediaKind.VIDEO || kindOf(row) === MeetingMediaKind.MUXED,
      )
      .map((row: { sequence: number }) => row.sequence);
    const missingAudioAll = expected ? missingSequences(expected, audioSeqs) : [];
    const missingVideoAll = expected ? missingSequences(expected, videoSeqs) : [];
    const missingAudio = missingAudioAll.slice(0, config.maxMissingSequencesInResponse);
    const missingVideo = missingVideoAll.slice(0, config.maxMissingSequencesInResponse);
    const hasSplitTracks = uploaded.some(
      (row: { mediaKind?: string | null }) =>
        kindOf(row) === MeetingMediaKind.AUDIO || kindOf(row) === MeetingMediaKind.VIDEO,
    );

    await refreshChunkCounters(meeting);
    meeting.totalChunks = expected
      ? expected * (hasSplitTracks ? 2 : 1)
      : meeting.uploadedChunks;

    if (expected && missingAudioAll.length === 0 && !meeting.pipelineStopEnqueued) {
      meeting.pipelineStopEnqueued = true;
      await markConversationStopRequested({
        conversationId: meeting._id,
        expectedLastSequence: expected,
        stoppedAt: meeting.endedAt || new Date(),
      });
      await this.queue.publish(
        config.finalizationStream,
        buildEnvelope({
          eventId: `meeting:${String(meeting._id)}:finalize`,
          eventType: "conversation.finalization.requested",
          userId: String(meeting.userId),
          spaceId: String(meeting.spaceId),
          conversationId: String(meeting._id),
          payload: {
            expectedLastSequence: expected,
            inputClosed: true,
            sourceType: MEETING_SOURCE_TYPE,
            meetingSessionId: String(meeting._id),
          },
        }),
      );
      logMeetingEvent("meeting_audio_pipeline_started", {
        meetingSessionId: String(meeting._id),
        userId: String(meeting.userId),
      });
    }

    if (
      expected &&
      missingVideoAll.length === 0 &&
      config.videoFinalizationEnabled &&
      (meeting.videoMergeStatus === VideoMergeStatus.NOT_STARTED || !meeting.videoMergeStatus)
    ) {
      meeting.videoMergeStatus = VideoMergeStatus.PENDING;
      await this.queue.publish(
        config.meetingMergeStream,
        buildEnvelope({
          eventId: `meeting:${String(meeting._id)}:merge`,
          eventType: "meeting.video.merge.requested",
          userId: String(meeting.userId),
          spaceId: String(meeting.spaceId),
          conversationId: String(meeting._id),
          payload: {
            meetingSessionId: String(meeting._id),
            userId: String(meeting.userId),
            expectedFinalSequence: expected,
            s3Prefix: config.s3Prefix,
            finalRecordingS3Key: buildFinalRecordingS3Key({
              prefix: config.s3Prefix,
              userId: String(meeting.userId),
              meetingSessionId: String(meeting._id),
            }),
          },
        }),
      );
      logMeetingEvent("meeting_video_merge_enqueued", {
        meetingSessionId: String(meeting._id),
        userId: String(meeting.userId),
      });
    }

    const uploadsIncomplete = !expected || missingAudioAll.length > 0 || missingVideoAll.length > 0;
    const alreadyPastUploads =
      meeting.status === MeetingStatus.UPLOAD_COMPLETE ||
      meeting.status === MeetingStatus.PROCESSING ||
      meeting.status === MeetingStatus.WAITING_FOR_TRANSCRIPTS ||
      meeting.status === MeetingStatus.FINALIZING ||
      meeting.status === MeetingStatus.READY;

    if (uploadsIncomplete) {
      if (!alreadyPastUploads) {
        meeting.status = MeetingStatus.WAITING_FOR_UPLOADS;
      }
      await meeting.save();
      logMeetingEvent("meeting_waiting_for_uploads", {
        meetingSessionId: String(meeting._id),
        userId: String(meeting.userId),
        status: meeting.status,
        missingAudioCount: missingAudioAll.length,
        missingVideoCount: missingVideoAll.length,
      });
      return this.toStopResponse(meeting, missingAudio, missingVideo);
    }

    if (!alreadyPastUploads) {
      meeting.status = MeetingStatus.UPLOAD_COMPLETE;
      meeting.processingStatus = "queued";
      await meeting.save();
      logMeetingEvent("meeting_upload_complete", {
        meetingSessionId: String(meeting._id),
        userId: String(meeting.userId),
        status: meeting.status,
      });
      meeting.status = MeetingStatus.PROCESSING;
      await meeting.save();
    }

    return this.toStopResponse(meeting, [], []);
  }

  private async syncFromConversation(
    meeting: mongoose.Document & Record<string, any>,
    conversation: Record<string, any> | null,
  ) {
    if (!conversation) {
      await meeting.save();
      return;
    }
    const mapped = mapConversationStatus(String(conversation.status || ""));
    if (conversation.status === "COMPLETED" || conversation.status === "PARTIAL") {
      meeting.transcriptStatus = "completed";
      meeting.intelligenceStatus = "completed";
      meeting.finalizedAt = conversation.processedAt || new Date();
    } else if (conversation.status === "FAILED") {
      meeting.status = MeetingStatus.FINALIZATION_FAILED;
      meeting.intelligenceStatus = "finalization_failed";
    } else if (conversation.status === "PROCESSING" || conversation.status === "VALIDATING") {
      meeting.intelligenceStatus = "processing";
    } else if (conversation.status === "WAITING_FOR_TRANSCRIPTS") {
      meeting.transcriptStatus = "waiting";
    }
    const waitingOnUploads =
      meeting.status === MeetingStatus.RECORDING ||
      meeting.status === MeetingStatus.STOP_REQUESTED ||
      meeting.status === MeetingStatus.WAITING_FOR_UPLOADS ||
      meeting.status === MeetingStatus.INTERRUPTED;
    if (mapped && meeting.status !== MeetingStatus.INTERRUPTED && !waitingOnUploads) {
      meeting.status = mapped;
    }
    await meeting.save();
  }

  private toCreateResponse(
    meeting: { _id: unknown; status?: string; spaceId?: unknown },
    chunkDurationMs: number,
  ) {
    return {
      meetingSessionId: String(meeting._id),
      spaceId: meeting.spaceId ? String(meeting.spaceId) : null,
      status: meeting.status,
      chunkDurationMs,
    };
  }

  private toStopResponse(
    meeting: { _id: unknown; status?: string },
    missingAudio: number[],
    missingVideo: number[],
  ) {
    return {
      meetingSessionId: String(meeting._id),
      status: meeting.status,
      missingSequences: missingAudio,
      missingAudioSequences: missingAudio,
      missingVideoSequences: missingVideo,
    };
  }

  private toDetail(meeting: Record<string, any>) {
    const client = toClientStatus({
      status: meeting.status,
      transcriptStatus: meeting.transcriptStatus,
      intelligenceStatus: meeting.intelligenceStatus,
      videoMergeStatus: meeting.videoMergeStatus,
    });
    return {
      meetingSessionId: String(meeting._id),
      userId: String(meeting.userId),
      spaceId: String(meeting.spaceId),
      provider: meeting.provider,
      sourceType: meeting.sourceType || MEETING_SOURCE_TYPE,
      meetingTitle: meeting.meetingTitle,
      meetingUrl: meeting.meetingUrl,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      durationMs: meeting.durationMs,
      expectedFinalSequence: meeting.expectedFinalSequence,
      lastReceivedSequence: meeting.lastReceivedSequence,
      totalChunks: meeting.totalChunks,
      uploadedChunks: meeting.uploadedChunks,
      processedChunks: meeting.processedChunks,
      failedChunks: meeting.failedChunks,
      recordingAvailable: Boolean(meeting.finalRecordingS3Key),
      finalRecordingS3Key: meeting.finalRecordingS3Key || null,
      extensionVersion: meeting.extensionVersion,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
      ...client,
    };
  }
}

export const meetingRecordingService = new MeetingRecordingService();

const mapConversationStatus = (status: string): MeetingStatus | null => {
  switch (status) {
    case "WAITING_FOR_TRANSCRIPTS":
      return MeetingStatus.WAITING_FOR_TRANSCRIPTS;
    case "FINALIZING":
      return MeetingStatus.FINALIZING;
    case "READY_FOR_PROCESSING":
    case "PROCESSING":
    case "VALIDATING":
      return MeetingStatus.PROCESSING;
    case "COMPLETED":
    case "PARTIAL":
      return MeetingStatus.READY;
    case "FAILED":
      return MeetingStatus.FINALIZATION_FAILED;
    default:
      return null;
  }
};
