import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  getPlansService,
  getUserPlanStatusService,
  PLAN_RESOURCES,
  reportListeningUsage,
  switchToFreePlanService,
  validatePlanLimit,
  type PlanResource,
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
      !PLAN_RESOURCES.includes(String(resource) as PlanResource)
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
      resource as PlanResource,
      Number(nextCount) || 1,
    );

    if (!response.allowed) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Plan limit reached.",
        response.data,
      );
    }

    return SuccessResponse(res, response.status, response.data || {});
  } catch (error) {
    next(error);
  }
};

export const reportListeningUsageController = async (
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

    const response = await reportListeningUsage(String(userId));

    if (!response.allowed) {
      const message =
        "message" in response && typeof response.message === "string"
          ? response.message
          : "Notes recording time limit reached.";
      return ErrorResponse(res, response.status, message, response.data);
    }

    return SuccessResponse(res, response.status, response.data || {});
  } catch (error) {
    next(error);
  }
};
