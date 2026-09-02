import { NextFunction, Response } from "express";
import mongoose from "mongoose";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  createCalendarEventServices,
  deleteCalendarEventServices,
  getCalendarEventsServices,
  updateCalendarEventServices,
} from "../Services/CalendarEvent.services.js";
import type { CalendarEventWriteInput } from "../Repository/CalendarEvent.repository.js";

const TITLE_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const LOCATION_MAX_LENGTH = 120;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_LABEL_PATTERN = /^(1[0-2]|[1-9]):[0-5]\d\s?(AM|PM)$/i;

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
    return { error: `'${fieldName}' must be a string.` };
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

const parseDateKey = (value: unknown, fieldName = "dateKey") => {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value.trim())) {
    return { error: `Invalid or missing '${fieldName}'. Use YYYY-MM-DD.` };
  }

  return { value: value.trim() };
};

const parseBoolean = (value: unknown, fieldName: string, fallback?: boolean) => {
  if (value == null && typeof fallback === "boolean") {
    return { value: fallback };
  }

  if (typeof value !== "boolean") {
    return { error: `'${fieldName}' must be a boolean.` };
  }

  return { value };
};

const minutesFromTimeLabel = (label: string) => {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour < 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
};

const parseEventPayload = (body: Record<string, unknown>) => {
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

  const parsedLocation = parseOptionalText(
    body.location,
    "Location",
    LOCATION_MAX_LENGTH,
  );
  if (parsedLocation.error) {
    return { error: parsedLocation.error };
  }

  const parsedDateKey = parseDateKey(body.dateKey ?? body.date, "dateKey");
  if (parsedDateKey.error) {
    return { error: parsedDateKey.error };
  }

  const parsedDateLabel = parseRequiredText(body.dateLabel, "Date label", 40);
  if (parsedDateLabel.error) {
    return { error: parsedDateLabel.error };
  }

  if (
    typeof body.startTimeLabel !== "string" ||
    !TIME_LABEL_PATTERN.test(body.startTimeLabel.trim())
  ) {
    return { error: "Invalid or missing 'startTimeLabel'. Use h:mm AM/PM." };
  }

  if (
    typeof body.endTimeLabel !== "string" ||
    !TIME_LABEL_PATTERN.test(body.endTimeLabel.trim())
  ) {
    return { error: "Invalid or missing 'endTimeLabel'. Use h:mm AM/PM." };
  }

  const startMinutes = minutesFromTimeLabel(body.startTimeLabel);
  const endMinutes = minutesFromTimeLabel(body.endTimeLabel);
  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return { error: "End time must be after the start time." };
  }

  const parsedAiReminder = parseBoolean(body.aiReminder, "aiReminder", false);
  if (parsedAiReminder.error) {
    return { error: parsedAiReminder.error };
  }

  const parsedAiCalling = parseBoolean(body.aiCalling, "aiCalling", false);
  if (parsedAiCalling.error) {
    return { error: parsedAiCalling.error };
  }

  const parsedNotification = parseBoolean(
    body.notification,
    "notification",
    true,
  );
  if (parsedNotification.error) {
    return { error: parsedNotification.error };
  }

  const parsedBeeping = parseBoolean(body.beeping, "beeping", false);
  if (parsedBeeping.error) {
    return { error: parsedBeeping.error };
  }

  const payload: CalendarEventWriteInput = {
    title: parsedTitle.value!,
    description: parsedDescription.value ?? "",
    location: parsedLocation.value ?? "",
    dateKey: parsedDateKey.value!,
    dateLabel: parsedDateLabel.value!,
    startTimeLabel: body.startTimeLabel.trim(),
    endTimeLabel: body.endTimeLabel.trim(),
    aiReminder: parsedAiReminder.value!,
    aiCalling: parsedAiCalling.value!,
    notification: parsedNotification.value!,
    beeping: parsedBeeping.value!,
  };

  return { payload };
};

export const getCalendarEventsController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const fromDate =
      typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toDate = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsedFrom = parseDateKey(fromDate, "from");
    if (parsedFrom.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedFrom.error);
    }

    const parsedTo = parseDateKey(toDate, "to");
    if (parsedTo.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTo.error);
    }

    if (parsedFrom.value! > parsedTo.value!) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "'from' must be on or before 'to'.",
      );
    }

    const response = await getCalendarEventsServices(
      String(userId),
      parsedFrom.value!,
      parsedTo.value!,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(
      res,
      response.status,
      "Unable to load calendar events.",
    );
  } catch (error) {
    next(error);
  }
};

export const createCalendarEventController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsed = parseEventPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid event payload.",
      );
    }

    const response = await createCalendarEventServices(
      String(userId),
      parsed.payload,
    );

    if (response.status !== STATUS_CODE.CREATED) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create event.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      event: response.data?.event,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCalendarEventController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { eventId } = req.body ?? {};

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (
      !eventId ||
      typeof eventId !== "string" ||
      !mongoose.isValidObjectId(eventId)
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'eventId'.",
      );
    }

    const parsed = parseEventPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid event payload.",
      );
    }

    const response = await updateCalendarEventServices(
      String(userId),
      eventId.trim(),
      parsed.payload,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update event.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      event: response.data?.event,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCalendarEventController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { eventId } = req.body ?? {};

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!eventId || typeof eventId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'eventId'.",
      );
    }

    const response = await deleteCalendarEventServices(
      String(userId),
      eventId.trim(),
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to delete event.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      deletedEventId: response.data?.deletedEventId,
    });
  } catch (error) {
    next(error);
  }
};
