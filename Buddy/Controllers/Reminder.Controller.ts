import { NextFunction, Response } from "express";
import mongoose from "mongoose";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  createReminderServices,
  deleteReminderServices,
  getRemindersServices,
  updateReminderServices,
} from "../Services/Reminder.services.js";
import type { ReminderWriteInput } from "../Repository/Reminder.repository.js";

const TITLE_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_LABEL_PATTERN = /^(1[0-2]|[1-9]):[0-5]\d\s?(AM|PM)$/i;
const REPEAT_VALUES = new Set([
  "once",
  "daily",
  "weekly",
  "weekdays",
  "monthly",
]);
const DATE_FILTERS = new Set(["all", "today", "tomorrow", "week"]);
const SOURCE_FILTERS = new Set(["all", "ai", "manual"]);

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const parseOptionalText = (
  value: unknown,
  fieldName: string,
  maxLength: number,
) => {
  if (value == null || value === "") {
    return { value: "" };
  }

  if (typeof value !== "string") {
    return { error: `${fieldName} must be text.` };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return {
      error: `${fieldName} must be at most ${maxLength} characters.`,
    };
  }

  return { value: trimmed };
};

const parseRequiredText = (
  value: unknown,
  fieldName: string,
  maxLength: number,
) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${fieldName} is required.` };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return {
      error: `${fieldName} must be at most ${maxLength} characters.`,
    };
  }

  return { value: trimmed };
};

const parseDateKey = (value: unknown, fieldName = "date") => {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value.trim())) {
    return { error: `Invalid or missing '${fieldName}'. Use YYYY-MM-DD.` };
  }

  return { value: value.trim() };
};

const parseBoolean = (value: unknown, fieldName: string) => {
  if (typeof value !== "boolean") {
    return { error: `'${fieldName}' must be a boolean.` };
  }

  return { value };
};

const parseReminderPayload = (body: Record<string, unknown>) => {
  const parsedTitle = parseRequiredText(body.title, "Title", TITLE_MAX_LENGTH);
  if (parsedTitle.error) {
    return { error: parsedTitle.error };
  }

  const parsedDescription = parseOptionalText(
    body.description,
    "Description",
    DESCRIPTION_MAX_LENGTH,
  );
  if (parsedDescription.error) {
    return { error: parsedDescription.error };
  }

  const parsedDateKey = parseDateKey(body.dateKey ?? body.date, "dateKey");
  if (parsedDateKey.error) {
    return { error: parsedDateKey.error };
  }

  const parsedDateLabel = parseRequiredText(
    body.dateLabel,
    "Date label",
    40,
  );
  if (parsedDateLabel.error) {
    return { error: parsedDateLabel.error };
  }

  if (
    typeof body.timeLabel !== "string" ||
    !TIME_LABEL_PATTERN.test(body.timeLabel.trim())
  ) {
    return { error: "Invalid or missing 'timeLabel'. Use h:mm AM/PM." };
  }

  const repeat =
    typeof body.repeat === "string" ? body.repeat.trim().toLowerCase() : "";
  if (!REPEAT_VALUES.has(repeat)) {
    return { error: "Invalid or missing 'repeat' value." };
  }

  const parsedAiCalling = parseBoolean(body.aiCalling, "aiCalling");
  if (parsedAiCalling.error) {
    return { error: parsedAiCalling.error };
  }

  const parsedNotification = parseBoolean(body.notification, "notification");
  if (parsedNotification.error) {
    return { error: parsedNotification.error };
  }

    const parsedBeeping = parseBoolean(body.beeping, "beeping");
    if (parsedBeeping.error) {
      return { error: parsedBeeping.error };
    }

    const sourceRaw =
      typeof body.source === "string" ? body.source.trim().toLowerCase() : "manual";
    if (sourceRaw !== "manual" && sourceRaw !== "ai") {
      return { error: "Invalid or missing 'source' value." };
    }

    const timeZoneRaw =
      typeof body.timezone === "string"
        ? body.timezone.trim()
        : typeof body.timeZone === "string"
          ? body.timeZone.trim()
          : "";
    if (timeZoneRaw && !/^[A-Za-z0-9_+\-\/]{1,64}$/.test(timeZoneRaw)) {
      return { error: "Invalid 'timezone' value." };
    }

    const payload: ReminderWriteInput = {
      title: parsedTitle.value!,
      description: parsedDescription.value!,
      dateKey: parsedDateKey.value!,
      dateLabel: parsedDateLabel.value!,
      timeLabel: body.timeLabel.trim(),
      repeat,
      aiCalling: parsedAiCalling.value!,
      notification: parsedNotification.value!,
      beeping: parsedBeeping.value!,
      source: sourceRaw,
      timeZone: timeZoneRaw || undefined,
    };

  return { payload };
};

export const getRemindersController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const source =
      typeof req.query.source === "string"
        ? req.query.source.trim().toLowerCase()
        : "all";
    const dateFilter =
      typeof req.query.dateFilter === "string"
        ? req.query.dateFilter.trim().toLowerCase()
        : "all";
    const anchorDate =
      typeof req.query.anchorDate === "string"
        ? req.query.anchorDate.trim()
        : undefined;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (req.query.limit && (Number.isNaN(limit) || limit <= 0 || limit > 50)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "'limit' must be a number between 1 and 50.",
      );
    }

    if (!SOURCE_FILTERS.has(source)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'source' filter.",
      );
    }

    if (!DATE_FILTERS.has(dateFilter)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'dateFilter' value.",
      );
    }

    if (dateFilter !== "all") {
      const parsedAnchor = parseDateKey(anchorDate, "anchorDate");
      if (parsedAnchor.error) {
        return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedAnchor.error);
      }
    }

    const response = await getRemindersServices(
      String(userId),
      limit,
      cursor,
      source,
      dateFilter,
      anchorDate,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

export const createReminderController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsed = parseReminderPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid reminder payload.",
      );
    }

    const response = await createReminderServices(String(userId), parsed.payload);

    if (response.status !== STATUS_CODE.CREATED) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create reminder.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      reminder: response.data?.reminder,
    });
  } catch (error) {
    next(error);
  }
};

export const updateReminderController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { reminderId } = req.body ?? {};

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (
      !reminderId ||
      typeof reminderId !== "string" ||
      !mongoose.isValidObjectId(reminderId)
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'reminderId'.",
      );
    }

    const parsed = parseReminderPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid reminder payload.",
      );
    }

    const response = await updateReminderServices(
      String(userId),
      reminderId.trim(),
      parsed.payload,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update reminder.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      reminder: response.data?.reminder,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteReminderController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { reminderId } = req.body ?? {};

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!reminderId || typeof reminderId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'reminderId'.",
      );
    }

    const response = await deleteReminderServices(
      String(userId),
      reminderId.trim(),
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to delete reminder.",
      );
    }

    return SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};
