import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  briefingOwnerFromAuth,
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

export { getDailyBriefingController };
