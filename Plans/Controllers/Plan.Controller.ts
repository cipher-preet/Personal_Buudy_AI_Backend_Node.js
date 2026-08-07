import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  getPlansService,
  getUserPlanStatusService,
  switchToFreePlanService,
  validatePlanLimit,
} from "../Services/Plan.services.js";

export const getPlansController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const response = await getPlansService();
    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const getUserPlanStatusController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.query.userId as string;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "User id is required.");
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await getUserPlanStatusService(userId);

    if (!response.data) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const activateFreePlanController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId } = req.body;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "User id is required.");
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await switchToFreePlanService(String(userId));

    if (!response.data) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const validatePlanLimitController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, resource, nextCount } = req.body;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (
      !userId ||
      !["spaces", "notes", "tasks"].includes(String(resource))
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "User id and valid resource are required.",
      );
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await validatePlanLimit(
      String(userId),
      resource,
      Number(nextCount) || 1,
    );

    if (!response.allowed) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Plan limit reached.",
      );
    }

    return SuccessResponse(res, response.status, response.data || {});
  } catch (error) {
    next(error);
  }
};
