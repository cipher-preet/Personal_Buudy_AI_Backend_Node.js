import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  deleteDeviceTokenRepository,
  upsertDeviceTokenRepository,
} from "../Repository/DeviceToken.repository.js";

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const PLATFORMS = new Set(["android", "ios", "web"]);

export const registerDeviceTokenController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platformRaw =
      typeof req.body?.platform === "string"
        ? req.body.platform.trim().toLowerCase()
        : "android";

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!token || token.length < 8 || token.length > 4096) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'token'.",
      );
    }

    if (!PLATFORMS.has(platformRaw)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'platform' value.",
      );
    }

    const response = await upsertDeviceTokenRepository(
      String(userId),
      token,
      platformRaw as "android" | "ios" | "web",
    );

    return SuccessResponse(res, response.status, {
      message: response.message,
      ...response.data,
    });
  } catch (error) {
    next(error);
  }
};

export const unregisterDeviceTokenController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!token) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'token'.",
      );
    }

    const response = await deleteDeviceTokenRepository(String(userId), token);
    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to remove device token.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
    });
  } catch (error) {
    next(error);
  }
};
