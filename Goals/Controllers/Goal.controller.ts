import type { NextFunction, Response } from "express";

import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { goalServices } from "../Services/Goal.services.js";

const ownerIdFrom = (req: CustomRequest) => req.authUser?.id || "";

const sendError = (res: Response, error: unknown) => {
  const status =
    typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : STATUS_CODE.INTERNAL_SERVER_ERROR;
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const data =
    typeof error === "object" &&
    error &&
    "data" in error &&
    typeof (error as { data?: unknown }).data === "object" &&
    (error as { data?: unknown }).data !== null
      ? ((error as { data: object }).data)
      : undefined;
  if (status >= 500) {
    console.error("Goal API error", message);
    return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.");
  }
  return ErrorResponse(res, status, message, data);
};

export const createGoalController = async (req: CustomRequest, res: Response, _next: NextFunction) => {
  try {
    const statement = typeof req.body?.statement === "string" ? req.body.statement.trim() : "";
    if (statement.length < 3 || statement.length > 2000) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Describe your goal in a few words.");
    }
    const data = await goalServices.create(ownerIdFrom(req), statement);
    return res.status(202).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const listGoalsController = async (req: CustomRequest, res: Response) => {
  try {
    const goals = await goalServices.list(ownerIdFrom(req));
    return SuccessResponse(res, STATUS_CODE.OK, { goals });
  } catch (error) {
    return sendError(res, error);
  }
};

export const deleteGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const result = await goalServices.remove(ownerIdFrom(req), String(req.params.id || ""));
    if (!result) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return SuccessResponse(res, STATUS_CODE.OK, result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const goal = await goalServices.get(ownerIdFrom(req), String(req.params.id || ""));
    if (!goal) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return SuccessResponse(res, STATUS_CODE.OK, { goal });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getGoalSetupController = async (req: CustomRequest, res: Response) => {
  try {
    const setup = await goalServices.setup(ownerIdFrom(req), String(req.params.id || ""));
    if (!setup) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return SuccessResponse(res, STATUS_CODE.OK, setup);
  } catch (error) {
    return sendError(res, error);
  }
};

export const answerGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const stepId = typeof req.body?.stepId === "string" ? req.body.stepId.trim() : "";
    const result = await goalServices.answer(
      ownerIdFrom(req),
      String(req.params.id || ""),
      stepId,
      req.body?.value,
    );
    if (!result) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const setGoalSpacesController = async (req: CustomRequest, res: Response) => {
  try {
    const spaceIds = Array.isArray(req.body?.spaceIds)
      ? req.body.spaceIds.filter((item: unknown): item is string => typeof item === "string")
      : [];
    const result = await goalServices.setSpaces(ownerIdFrom(req), String(req.params.id || ""), spaceIds);
    if (!result) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const activateGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const goal = await goalServices.activate(ownerIdFrom(req), String(req.params.id || ""));
    if (!goal) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    }
    return SuccessResponse(res, STATUS_CODE.OK, { goal });
  } catch (error) {
    return sendError(res, error);
  }
};

export const retryGoalJobController = async (req: CustomRequest, res: Response) => {
  try {
    const job = await goalServices.retry(
      ownerIdFrom(req),
      String(req.params.id || ""),
      String(req.params.jobId || ""),
    );
    if (!job) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal step not found.");
    }
    return res.status(202).json({ success: true, data: { job } });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getGoalDashboardController = async (req: CustomRequest, res: Response) => {
  try {
    const dashboard = await goalServices.dashboard(ownerIdFrom(req), String(req.params.id || ""));
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const checkinGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const value = Number(req.body?.value);
    if (!Number.isFinite(value)) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Enter a numeric result.");
    }
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    const dashboard = await goalServices.checkin(ownerIdFrom(req), String(req.params.id || ""), value, note);
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const feedbackGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const reaction = typeof req.body?.reaction === "string" ? req.body.reaction.trim() : "";
    const dashboard = await goalServices.feedback(
      ownerIdFrom(req),
      String(req.params.id || ""),
      String(req.params.recommendationId || ""),
      reaction,
    );
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Recommendation not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const pauseGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const dashboard = await goalServices.pause(ownerIdFrom(req), String(req.params.id || ""));
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const approveGoalRevisionController = async (req: CustomRequest, res: Response) => {
  try {
    const dashboard = await goalServices.approveRevision(ownerIdFrom(req), String(req.params.id || ""));
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getGoalSourcesController = async (req: CustomRequest, res: Response) => {
  try {
    const sources = await goalServices.sources(ownerIdFrom(req), String(req.params.id || ""));
    if (!sources) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, sources);
  } catch (error) {
    return sendError(res, error);
  }
};

export const refreshGoalResearchController = async (req: CustomRequest, res: Response) => {
  try {
    const result = await goalServices.refreshResearch(ownerIdFrom(req), String(req.params.id || ""));
    if (!result) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const replanGoalController = async (req: CustomRequest, res: Response) => {
  try {
    const result = await goalServices.replan(ownerIdFrom(req), String(req.params.id || ""));
    if (!result) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

export const goalWorkspaceActionController = async (req: CustomRequest, res: Response) => {
  try {
    const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
    const dashboard = await goalServices.workspaceAction(ownerIdFrom(req), String(req.params.id || ""), {
      action,
      stepId: typeof req.body?.stepId === "string" ? req.body.stepId.trim() : "",
      date: typeof req.body?.date === "string" ? req.body.date.trim() : "",
      note: typeof req.body?.note === "string" ? req.body.note : "",
      mode: typeof req.body?.mode === "string" ? req.body.mode.trim() : "",
      recommendationId: typeof req.body?.recommendationId === "string" ? req.body.recommendationId.trim() : "",
      adjustmentIds: Array.isArray(req.body?.adjustmentIds)
        ? req.body.adjustmentIds.filter((item: unknown): item is string => typeof item === "string")
        : [],
      reflection: typeof req.body?.reflection === "string" ? req.body.reflection : "",
    });
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};

export const toggleGoalPlanItemController = async (req: CustomRequest, res: Response) => {
  try {
    const kind = req.body?.kind === "checklist_item" ? "checklist_item" : "day_task";
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId.trim() : "";
    const done = typeof req.body?.done === "boolean" ? req.body.done : undefined;
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    if (!itemId) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "itemId is required.");
    }
    if (done === undefined && note === undefined) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Provide done or note to update.");
    }
    const dashboard = await goalServices.togglePlanItem(ownerIdFrom(req), String(req.params.id || ""), {
      kind,
      itemId,
      done,
      note,
    });
    if (!dashboard) return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Goal not found.");
    return SuccessResponse(res, STATUS_CODE.OK, { dashboard });
  } catch (error) {
    return sendError(res, error);
  }
};
