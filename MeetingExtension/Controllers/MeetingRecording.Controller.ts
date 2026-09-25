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

export const getMeetingSummaryController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.getSummary(ownerId(req), param(req.params.sessionId)),
  );
};

export const getMeetingTasksController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.getTasks(ownerId(req), param(req.params.sessionId)),
  );
};

export const getMeetingNotesController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.getNotes(ownerId(req), param(req.params.sessionId)),
  );
};

export const assignMeetingSpaceController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }
  return handle(res, () =>
    meetingRecordingService.assignSpace(
      ownerId(req),
      param(req.params.sessionId),
      req.body || {},
    ),
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

export const streamMeetingPlaybackController = async (req: CustomRequest, res: Response) => {
  if (!isMeetingExtensionEnabled()) {
    return unavailable(res);
  }

  try {
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;
    const stream = await meetingRecordingService.openPlaybackStream(
      ownerId(req),
      param(req.params.sessionId),
      rangeHeader,
    );

    res.status(stream.statusCode);
    res.setHeader("Content-Type", stream.contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store");
    // Prevent intermediaries from rewriting to chunked encoding (breaks timeline seeking).
    if (stream.contentLength != null) {
      res.setHeader("Content-Length", String(stream.contentLength));
    }
    if (stream.contentRange) {
      res.setHeader("Content-Range", stream.contentRange);
    }
    if (stream.etag) {
      res.setHeader("ETag", stream.etag);
    }

    const body = stream.body as {
      pipe?: (dest: Response) => { on?: (event: string, cb: (...args: unknown[]) => void) => void };
      destroy?: (error?: Error) => void;
    } | null;

    if (!body || typeof body.pipe !== "function") {
      return ErrorResponse(res, 502, "Recording stream unavailable.", {
        code: MeetingErrorCode.MEETING_PROCESSING_FAILED,
      });
    }

    const abortStream = () => {
      if (typeof body.destroy === "function") {
        body.destroy();
      }
    };

    req.on("close", () => {
      // Only tear down when the client aborts (seek / remount). Finished responses are fine.
      if (!res.writableEnded && (req.aborted || req.destroyed)) {
        abortStream();
      }
    });

    body.pipe(res)?.on?.("error", (error: unknown) => {
      console.error("Meeting playback stream pipe error", error);
      abortStream();
      if (!res.headersSent) {
        ErrorResponse(res, 502, "Recording stream unavailable.", {
          code: MeetingErrorCode.MEETING_PROCESSING_FAILED,
        });
        return;
      }
      res.destroy();
    });
  } catch (error) {
    if (error instanceof MeetingError) {
      if (error.status === 416) {
        const totalSize =
          error.data && typeof error.data === "object" && "totalSize" in error.data
            ? Number((error.data as { totalSize?: unknown }).totalSize)
            : null;
        res.setHeader("Accept-Ranges", "bytes");
        if (Number.isFinite(totalSize) && totalSize != null && totalSize > 0) {
          res.setHeader("Content-Range", `bytes */${totalSize}`);
        }
        return ErrorResponse(res, 416, error.message, {
          code: error.code,
          ...(error.data || {}),
        });
      }
      return ErrorResponse(res, error.status, error.message, {
        code: error.code,
        ...(error.data || {}),
      });
    }
    console.error("Meeting playback stream error", error);
    return ErrorResponse(res, 500, "Something went wrong. Please try again.", {
      code: MeetingErrorCode.MEETING_PROCESSING_FAILED,
    });
  }
};
