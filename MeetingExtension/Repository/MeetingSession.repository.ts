import mongoose from "mongoose";

import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import { MeetingSession } from "../Modals/MeetingSession.Modal.js";
import { DEFAULT_MEETINGS_SPACE_NAME, MeetingStatus, VideoMergeStatus } from "../constants.js";
import type { MeetingStatus as MeetingStatusType } from "../constants.js";

const userFilter = (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) {
    return userId;
  }
  return { $in: [userId, new mongoose.Types.ObjectId(userId)] };
};

export const findOwnedSpace = async (userId: string, spaceId: string) => {
  if (!mongoose.isValidObjectId(spaceId)) {
    return null;
  }
  return CreateSpace.findOne({
    _id: spaceId,
    userId: userFilter(userId),
    deletedAt: null,
  }).lean();
};

export const resolveSpaceForMeetingUser = async (
  userId: string,
  requestedSpaceId?: string,
) => {
  if (requestedSpaceId) {
    const owned = await findOwnedSpace(userId, requestedSpaceId);
    if (!owned) {
      return null;
    }
    return owned;
  }

  const named = await CreateSpace.findOne({
    userId: userFilter(userId),
    spacename: DEFAULT_MEETINGS_SPACE_NAME,
    deletedAt: null,
  }).sort({ createdAt: 1 });
  if (named) {
    return named;
  }

  const existing = await CreateSpace.findOne({
    userId: userFilter(userId),
    deletedAt: null,
  }).sort({ createdAt: 1 });
  if (existing) {
    return existing;
  }

  return CreateSpace.create({
    spacename: DEFAULT_MEETINGS_SPACE_NAME,
    description: "Default space for Chrome meeting recordings",
    userId: mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId,
  });
};

export const findMeetingByClientRequestId = async (
  userId: string,
  clientRequestId: string,
) => {
  return MeetingSession.findOne({
    userId,
    clientRequestId,
  });
};

export const createMeetingSession = async (fields: Record<string, unknown>) => {
  return MeetingSession.create(fields);
};

export const findMeetingById = async (meetingSessionId: string) => {
  if (!mongoose.isValidObjectId(meetingSessionId)) {
    return null;
  }
  return MeetingSession.findById(meetingSessionId);
};

export const saveMeeting = async (doc: mongoose.Document) => doc.save();

export const listMeetingsForUser = async ({
  userId,
  limit,
  cursor,
}: {
  userId: string;
  limit: number;
  cursor?: string;
}) => {
  const query: Record<string, unknown> = { userId: userFilter(userId) };
  if (cursor && mongoose.isValidObjectId(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }
  const items = await MeetingSession.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page,
    nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
  };
};

export const markStaleMeetings = async ({
  cutoff,
  statuses,
}: {
  cutoff: Date;
  statuses: MeetingStatusType[];
}) => {
  const result = await MeetingSession.updateMany(
    {
      status: { $in: statuses },
      updatedAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "INTERRUPTED",
        lastErrorCode: "MEETING_INTERRUPTED",
        lastErrorMessage: "Recording session went stale before STOP.",
      },
    },
  );
  return result.modifiedCount;
};

/** Meetings waiting on late uploads past the post-STOP grace window. */
export const findMeetingsNeedingUploadAdvance = async ({
  cutoff,
  limit = 25,
}: {
  cutoff: Date;
  limit?: number;
}) => {
  return MeetingSession.find({
    expectedFinalSequence: { $ne: null },
    stopRequestedAt: { $ne: null, $lte: cutoff },
    $or: [
      {
        // AI / finalization never armed
        status: {
          $in: [MeetingStatus.STOP_REQUESTED, MeetingStatus.WAITING_FOR_UPLOADS],
        },
        pipelineStopEnqueued: { $ne: true },
      },
      {
        // Playback stuck: conversation status may have advanced, but merge never started
        finalRecordingS3Key: null,
        $or: [
          { videoMergeStatus: VideoMergeStatus.NOT_STARTED },
          { videoMergeStatus: null },
          { videoMergeStatus: { $exists: false } },
        ],
      },
    ],
  })
    .sort({ stopRequestedAt: 1 })
    .limit(limit);
};
