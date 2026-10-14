import { Response } from "express";
import mongoose from "mongoose";
import type { CustomRequest } from "../../types/types.js";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import {
  getNotificationFeed,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "../Services/Notifications.services.js";

const getAuthenticatedUserId = (req: CustomRequest) => {
  const id = req.authUser?.id || req.session?.user?.id;
  return id && mongoose.isValidObjectId(String(id)) ? String(id) : null;
};

export const getNotificationsController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const feed = await getNotificationFeed(userId, {
      unreadOnly: req.query.filter === "unread",
      limit: Number(req.query.limit) || undefined,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
    });
    return SuccessResponse(res, STATUS_CODE.OK, feed);
  } catch (error) {
    console.log("notifications feed failed", error);
    return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, "Unable to load notifications.");
  }
};

export const getUnreadNotificationCountController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const result = await getUnreadNotificationCount(userId);
    return SuccessResponse(res, STATUS_CODE.OK, result);
  } catch (error) {
    console.log("notifications unread count failed", error);
    return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, "Unable to load notification count.");
  }
};

export const markNotificationsReadController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    await markNotificationsRead(userId, req.body?.ids);
    return SuccessResponse(res, STATUS_CODE.OK, { message: "Marked as read." });
  } catch (error) {
    console.log("mark notifications read failed", error);
    return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, "Unable to update notifications.");
  }
};

export const markAllNotificationsReadController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    await markAllNotificationsRead(userId);
    return SuccessResponse(res, STATUS_CODE.OK, { message: "All notifications marked as read." });
  } catch (error) {
    console.log("mark all notifications read failed", error);
    return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, "Unable to update notifications.");
  }
};
