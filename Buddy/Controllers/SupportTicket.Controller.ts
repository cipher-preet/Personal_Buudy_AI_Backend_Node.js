import { NextFunction, Response } from "express";
import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { createSupportTicketServices } from "../Services/SupportTicket.services.js";

const CATEGORY_IDS = new Set([
  "account",
  "billing",
  "technical",
  "reminder",
  "other",
]);

const getAuthenticatedUser = (req: CustomRequest) => {
  const auth = req.authUser || req.session?.user;
  if (!auth?.id) {
    return null;
  }

  return {
    id: String(auth.id),
    email:
      typeof (auth as { email?: unknown }).email === "string"
        ? (auth as { email: string }).email.trim()
        : null,
    name:
      typeof (auth as { name?: unknown }).name === "string"
        ? (auth as { name: string }).name.trim()
        : null,
  };
};

const parseTicketPayload = (body: Record<string, unknown>) => {
  const categoryId =
    typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryLabel =
    typeof body.categoryLabel === "string" ? body.categoryLabel.trim() : "";
  const subject =
    typeof body.subject === "string" ? body.subject.trim() : "";
  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!CATEGORY_IDS.has(categoryId)) {
    return { error: "Invalid support category." };
  }

  if (!categoryLabel || categoryLabel.length > 120) {
    return { error: "Invalid or missing category label." };
  }

  if (!subject || subject.length < 4) {
    return { error: "Please add a short subject (at least 4 characters)." };
  }

  if (subject.length > 120) {
    return { error: "Subject is too long (max 120 characters)." };
  }

  if (!message || message.length < 12) {
    return {
      error: "Please share a bit more detail (at least 12 characters).",
    };
  }

  if (message.length > 2000) {
    return { error: "Ticket details are too long (max 2000 characters)." };
  }

  return {
    payload: {
      categoryId,
      categoryLabel,
      subject,
      message,
    },
  };
};

export const raiseSupportTicketController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const parsed = parseTicketPayload(req.body ?? {});
    if (parsed.error || !parsed.payload) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsed.error || "Invalid support ticket payload.",
      );
    }

    const response = await createSupportTicketServices(user.id, {
      ...parsed.payload,
      contactEmail: user.email,
      contactName: user.name,
    });

    if (response.status !== STATUS_CODE.CREATED || !response.data) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Failed to raise support ticket.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
