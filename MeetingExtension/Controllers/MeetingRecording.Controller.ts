import type { Response } from "express";

import { ErrorResponse, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { isMeetingExtensionEnabled } from "../config.js";
import { MeetingErrorCode } from "../constants.js";
import { MeetingError } from "../errors.js";
import { meetingRecordingService } from "../Services/MeetingRecording.services.js";

const unavailable = (res: Response) =>
  ErrorResponse(
    res,
    503,
    "Meeting extension backend is disabled.",
    { code: MeetingErrorCode.MEETING_EXTENSION_UNAVAILABLE },
  );

const handle = async (res: Response, work: () => Promise<unknown>) => {
  try {
    const data = await work();
    return SuccessResponse(res, 200, data as object);
  } catch (error) {
    if (error instanceof MeetingError) {
      return ErrorResponse(res, error.status, error.message, {
        code: error.code,
        ...(error.data || {}),
      });
    }
    console.error("Meeting extension error", error);
    return ErrorResponse(res, 500, "Something went wrong. Please try again.", {
      code: MeetingErrorCode.MEETING_PROCESSING_FAILED,
    });
  }
};

const ownerId = (req: CustomRequest) => req.authUser?.id;

const param = (value: string | string[] | undefined) =>
  Array.isArray(value) ? String(value[0] || "") : String(value || "");

export const createMeetingController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () => meetingRecordingService.create(ownerId(req), req.body || {}));
};

export const presignChunkController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.presign(ownerId(req), param(req.params.sessionId), req.body || {}),
  );
};

export const completeChunkController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.complete(
      ownerId(req),
      param(req.params.sessionId),
      param(req.params.sequence),
      req.body || {},
    ),
  );
};

export const stopMeetingController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.stop(ownerId(req), param(req.params.sessionId), req.body || {}),
  );
};

export const listMeetingsController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () => meetingRecordingService.list(ownerId(req), req.query || {}));
};

export const getMeetingController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () => meetingRecordingService.get(ownerId(req), param(req.params.sessionId)));
};

export const getMeetingTranscriptController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.getTranscript(ownerId(req), param(req.params.sessionId)),
  );
};

export const getMeetingPlaybackController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.getPlayback(ownerId(req), param(req.params.sessionId)),
  );
};
