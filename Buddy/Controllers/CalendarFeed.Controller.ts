import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { getCalendarFeedServices } from "../Services/CalendarFeed.services.js";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const parseDateKey = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value.trim())) {
    return { error: `Invalid or missing '${fieldName}'. Use YYYY-MM-DD.` };
  }

  return { value: value.trim() };
};

export const getCalendarFeedController = async (
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

    const response = await getCalendarFeedServices(
      String(userId),
      parsedFrom.value!,
      parsedTo.value!,
    );

    if (response.status !== STATUS_CODE.OK || !response.data) {
      return ErrorResponse(
        res,
        response.status || STATUS_CODE.BAD_REQUEST,
        response.message || "Unable to load calendar feed.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
