import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  briefingOwnerFromAuth,
  forceGenerateDailyBriefingForUser,
  getDailyBriefingForUser,
  parseBriefingDateKey,
} from "../Repository/DailyBriefing.repository.js";

const getDailyBriefingController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = briefingOwnerFromAuth(
      req.authUser?.id || req.session?.user?.id,
      req.query.userId,
    );
    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsedDate = parseBriefingDateKey(req.query.date);
    if (parsedDate.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedDate.error);
    }

    const result = await getDailyBriefingForUser(userId, parsedDate.value);
    if (result.status !== 200) {
      return ErrorResponse(res, result.status, result.message);
    }
    return SuccessResponse(res, STATUS_CODE.OK, result.briefing);
  } catch (error) {
    next(error);
  }
};

/** TEMPORARY: force regenerate briefing for testing without waiting for midnight. */
const forceGenerateDailyBriefingController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = briefingOwnerFromAuth(
      req.authUser?.id || req.session?.user?.id,
      req.body?.userId,
    );
    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsedDate = parseBriefingDateKey(req.body?.date);
    if (parsedDate.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedDate.error);
    }

    const periodRaw = req.body?.period;
    const period =
      periodRaw === "yesterday" || periodRaw === "today"
        ? periodRaw
        : "today";

    const result = await forceGenerateDailyBriefingForUser(userId, {
      date: parsedDate.value,
      period,
    });

    if (result.status !== 200) {
      const status =
        result.status === 403
          ? STATUS_CODE.FORBIDDEN
          : result.status === 404
            ? STATUS_CODE.NOT_FOUND
            : result.status === 400
              ? STATUS_CODE.BAD_REQUEST
              : STATUS_CODE.INTERNAL_SERVER_ERROR;
      return ErrorResponse(res, status, result.message);
    }

    return SuccessResponse(res, STATUS_CODE.OK, result.result ?? {});
  } catch (error) {
    next(error);
  }
};

export {
  getDailyBriefingController,
  forceGenerateDailyBriefingController,
};
