import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { createFeedbackServices } from "../Services/Feedback.services.js";

const TOPIC_IDS = new Set([
  "app_bug",
  "reminder_issue",
  "ai_issue",
  "billing",
  "other",
]);

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const parseFeedbackPayload = (body: Record<string, unknown>) => {
  const topicId =
    typeof body.topicId === "string" ? body.topicId.trim() : "";
  const topicLabel =
    typeof body.topicLabel === "string" ? body.topicLabel.trim() : "";
  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!TOPIC_IDS.has(topicId)) {
    return { error: "Invalid feedback topic." };
  }

  if (!topicLabel || topicLabel.length > 120) {
    return { error: "Invalid or missing topic label." };
  }

  if (!message || message.length < 8) {
    return {
      error: "Please share a bit more detail (at least 8 characters).",
    };
  }

  if (message.length > 1200) {
    return { error: "Feedback is too long (max 1200 characters)." };
  }

  return {
    payload: {
      topicId,
      topicLabel,
      message,
    },
  };
};

export const submitFeedbackController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsed = parseFeedbackPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid feedback payload.",
      );
    }

    const response = await createFeedbackServices(
      String(userId),
      parsed.payload,
    );

    if (response.status !== STATUS_CODE.CREATED || !response.data) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Failed to submit feedback.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
