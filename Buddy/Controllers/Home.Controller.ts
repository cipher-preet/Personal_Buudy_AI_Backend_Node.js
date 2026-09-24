import {
  ErrorResponse,
  STATUS_CODE,
  SuccessResponse,
} from "../../Api/index.js";
import { NextFunction, Request, Response } from "express";
import type { CustomRequest } from "../../types/types.js";
import {
  createSpaceService,
  createStagedNoteServices,
  createStagedTaskServices,
  deleteSpaceServices,
  deleteStagedNoteServices,
  deleteStagedTaskServices,
  getNoteDateMarkersBySpaceServices,
  getNoteWorkspacesServices,
  getProfileSummaryServices,
  getSpaceStatsServices,
  getStagedNoteByIdServices,
  getStagedNotesBySpaceServices,
  getStagedTasksBySpaceServices,
  getTaskDateMarkersBySpaceServices,
  getUserActiveSpaceServices,
  getUserSpacesByUserIdServices,
  startListningServices,
  updateSpaceServices,
  updateStagedNoteServices,
  updateStagedTaskServices,
  setStagedTaskStatusServices,
} from "../Services/Home.services.js";
import mongoose, { Model } from "mongoose";

const createSpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { spacename, userId } = req.body;

    if (
      !spacename ||
      typeof spacename !== "string" ||
      spacename.trim().length < 3
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'spacename'. It must be at least 3 characters.",
      );
    }

    if (!userId || (typeof userId !== "string" && typeof userId !== "number")) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'userId'.",
      );
    }

    const response = await createSpaceService(spacename.trim(), String(userId));

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create space.",
        response.data,
      );
    }

    SuccessResponse(res, response.status, {
      message: response.message || "Space created successfully",
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseRequiredText = (
  value: unknown,
  fieldName: string,
  maxLength?: number,
) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${fieldName} is required.` };
  }

  const trimmed = value.trim();

  if (typeof maxLength === "number" && trimmed.length > maxLength) {
    return {
      error: `${fieldName} must be at most ${maxLength} characters.`,
    };
  }

  return { value: trimmed };
};

const parseOptionalDateKey = (value: unknown) => {
  if (value == null || value === "") {
    return { value: undefined as string | undefined };
  }

  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value.trim())) {
    return { error: "Invalid 'date'. Use YYYY-MM-DD." };
  }

  return { value: value.trim() };
};

//--------------------------------------------------------------------------------

const deleteSpaceController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { spaceId } = req.body;
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!spaceId || typeof spaceId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'spaceId'.",
      );
    }

    const response = await deleteSpaceServices(String(userId), spaceId.trim());

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to delete space.",
      );
    }

    return SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const updateSpaceController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { spaceId, spacename, description } = req.body;
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!spaceId || typeof spaceId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'spaceId'.",
      );
    }

    if (spacename === undefined && description === undefined) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "At least one of 'spacename' or 'description' is required.",
      );
    }

    const updates: { spacename?: string; description?: string } = {};

    if (spacename !== undefined) {
      if (
        typeof spacename !== "string" ||
        spacename.trim().length < 3
      ) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Invalid or missing 'spacename'. It must be at least 3 characters.",
        );
      }
      updates.spacename = spacename.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Invalid 'description'.",
        );
      }
      updates.description = description.trim();
    }

    const response = await updateSpaceServices(
      String(userId),
      spaceId.trim(),
      updates,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update space.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      space:
        response.data && "space" in response.data
          ? response.data.space
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getUserSpacesByUserIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const limit = req.query.limit ? Number(req.query.limit) : 4;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (req.query.limit && (Number.isNaN(limit) || limit <= 0 || limit > 50)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "'limit' must be a number between 1 and 50.",
      );
    }

    const response = await getUserSpacesByUserIdServices(userId, limit, cursor);

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
    }

    SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getUserActiveSpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.query.userId as string;

    const response = await getUserActiveSpaceServices(userId);

    return SuccessResponse(res, STATUS_CODE.OK, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const startListningController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { spaceId, isListning } = req.body;

    const response = await startListningServices(spaceId, isListning);

    if (response.status === STATUS_CODE.BAD_REQUEST || response.status === STATUS_CODE.FORBIDDEN) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update listening state.",
        response.data,
      );
    }

    SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getSpaceStatsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (!spaceId || spaceId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    const response = await getSpaceStatsServices(userId.trim(), spaceId.trim());

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getProfileSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    const response = await getProfileSummaryServices(userId.trim());

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getNoteWorkspacesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    const response = await getNoteWorkspacesServices(userId.trim());

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getStagedNotesBySpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const date =
      typeof req.query.date === "string" ? req.query.date.trim() : undefined;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (!spaceId || spaceId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    if (req.query.limit && (Number.isNaN(limit) || limit <= 0 || limit > 50)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "'limit' must be a number between 1 and 50.",
      );
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'date' query parameter. Expected YYYY-MM-DD.",
      );
    }

    const response = await getStagedNotesBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      limit,
      cursor,
      date,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getStagedNoteByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const noteId = req.query.noteId as string;

    if (!noteId || noteId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'noteId' query parameter.",
      );
    }

    const response = await getStagedNoteByIdServices(noteId.trim());

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const deleteStagedNoteController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { noteId } = req.body;
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!noteId || typeof noteId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'noteId'.",
      );
    }

    const response = await deleteStagedNoteServices(
      String(userId),
      noteId.trim(),
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to delete note.",
      );
    }

    return SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const updateStagedNoteController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { noteId, title, description, date } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!noteId || typeof noteId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'noteId'.",
      );
    }

    if (title === undefined && description === undefined && date === undefined) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "At least one of 'title', 'description', or 'date' is required.",
      );
    }

    const updates: { title?: string; body?: string; dateKey?: string } = {};

    if (title !== undefined) {
      const parsedTitle = parseRequiredText(title, "Title");
      if (parsedTitle.error) {
        return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
      }
      updates.title = parsedTitle.value;
    }

    if (description !== undefined) {
      const parsedDescription = parseRequiredText(description, "Description");
      if (parsedDescription.error) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          parsedDescription.error,
        );
      }
      updates.body = parsedDescription.value;
    }

    if (date !== undefined) {
      const parsedDate = parseOptionalDateKey(date);
      if (parsedDate.error || !parsedDate.value) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          parsedDate.error || "Invalid 'date'. Use YYYY-MM-DD.",
        );
      }
      updates.dateKey = parsedDate.value;
    }

    const response = await updateStagedNoteServices(
      String(userId),
      noteId.trim(),
      updates,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update note.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      note:
        response.data && "note" in response.data
          ? response.data.note
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getStagedTasksBySpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const date =
      typeof req.query.date === "string" ? req.query.date.trim() : undefined;

    if (!userId || userId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (!spaceId || spaceId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    if (req.query.limit && (Number.isNaN(limit) || limit <= 0 || limit > 50)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "'limit' must be a number between 1 and 50.",
      );
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'date' query parameter. Expected YYYY-MM-DD.",
      );
    }

    const response = await getStagedTasksBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      limit,
      cursor,
      date,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const deleteStagedTaskController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { taskId } = req.body;
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!taskId || typeof taskId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'taskId'.",
      );
    }

    const response = await deleteStagedTaskServices(
      String(userId),
      taskId.trim(),
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to delete task.",
      );
    }

    return SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const updateStagedTaskController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { taskId, title, description, date, priority } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!taskId || typeof taskId !== "string") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'taskId'.",
      );
    }

    if (
      title === undefined &&
      description === undefined &&
      date === undefined &&
      priority === undefined
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "At least one of 'title', 'description', 'date', or 'priority' is required.",
      );
    }

    const updates: {
      title?: string;
      description?: string;
      dateKey?: string;
      priority?: string;
    } = {};

    if (title !== undefined) {
      const parsedTitle = parseRequiredText(title, "Title");
      if (parsedTitle.error) {
        return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
      }
      updates.title = parsedTitle.value;
    }

    if (description !== undefined) {
      const parsedDescription = parseRequiredText(description, "Description");
      if (parsedDescription.error) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          parsedDescription.error,
        );
      }
      updates.description = parsedDescription.value;
    }

    if (date !== undefined) {
      const parsedDate = parseOptionalDateKey(date);
      if (parsedDate.error || !parsedDate.value) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          parsedDate.error || "Invalid 'date'. Use YYYY-MM-DD.",
        );
      }
      updates.dateKey = parsedDate.value;
    }

    if (priority !== undefined) {
      if (typeof priority !== "string") {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Invalid 'priority'.",
        );
      }
      updates.priority = priority;
    }

    const response = await updateStagedTaskServices(
      String(userId),
      taskId.trim(),
      updates,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update task.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      task:
        response.data && "task" in response.data
          ? response.data.task
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const setStagedTaskStatusController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { taskId, done } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!taskId || typeof taskId !== "string" || !mongoose.isValidObjectId(taskId)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'taskId'.",
      );
    }

    if (typeof done !== "boolean") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'done'. Expected a boolean.",
      );
    }

    const response = await setStagedTaskStatusServices(
      String(userId),
      taskId.trim(),
      done,
    );

    if (response.status !== STATUS_CODE.OK) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to update task status.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      task:
        response.data && "task" in response.data
          ? response.data.task
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const createStagedNoteController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { spaceId, title, description, date } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!spaceId || typeof spaceId !== "string" || !mongoose.isValidObjectId(spaceId)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'spaceId'.",
      );
    }

    const parsedTitle = parseRequiredText(title, "Title");
    if (parsedTitle.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
    }

    const parsedDescription = parseRequiredText(description, "Description");
    if (parsedDescription.error) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsedDescription.error,
      );
    }

    const parsedDate = parseOptionalDateKey(date);
    if (parsedDate.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedDate.error);
    }

    const response = await createStagedNoteServices(
      String(userId),
      spaceId.trim(),
      parsedTitle.value!,
      parsedDescription.value!,
      parsedDate.value,
    );

    if (response.status !== STATUS_CODE.CREATED) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create note.",
        response.data,
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      note:
        response.data && "note" in response.data
          ? response.data.note
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const createStagedTaskController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { spaceId, title, description, date, priority } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!spaceId || typeof spaceId !== "string" || !mongoose.isValidObjectId(spaceId)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid or missing 'spaceId'.",
      );
    }

    const parsedTitle = parseRequiredText(title, "Title");
    if (parsedTitle.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
    }

    const parsedDescription = parseRequiredText(description, "Description");
    if (parsedDescription.error) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        parsedDescription.error,
      );
    }

    const parsedDate = parseOptionalDateKey(date);
    if (parsedDate.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedDate.error);
    }

    const response = await createStagedTaskServices(
      String(userId),
      spaceId.trim(),
      parsedTitle.value!,
      parsedDescription.value!,
      parsedDate.value,
      typeof priority === "string" ? priority : undefined,
    );

    if (response.status !== STATUS_CODE.CREATED) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create task.",
        response.data,
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      task:
        response.data && "task" in response.data
          ? response.data.task
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getNoteDateMarkersBySpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!userId?.trim()) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (!spaceId?.trim()) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    if (!DATE_KEY_PATTERN.test(from) || !DATE_KEY_PATTERN.test(to)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'from'/'to'. Expected YYYY-MM-DD.",
      );
    }

    const response = await getNoteDateMarkersBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      from,
      to,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const getTaskDateMarkersBySpaceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!userId?.trim()) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'userId' query parameter.",
      );
    }

    if (!spaceId?.trim()) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    if (!DATE_KEY_PATTERN.test(from) || !DATE_KEY_PATTERN.test(to)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid 'from'/'to'. Expected YYYY-MM-DD.",
      );
    }

    const response = await getTaskDateMarkersBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      from,
      to,
    );

    if (response.data) {
      return SuccessResponse(res, response.status, response.data);
    }

    return ErrorResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

const gettranscriptchunkcontroller = async (  req: CustomRequest,
  res: Response,
  next: NextFunction,) => {
  try {

    const { spaceId } = req.query;

    console.log("Received spaceId:", spaceId);

    const TranscriptChunk = await mongoose.model('transcript_chunks', new mongoose.Schema({}));
    const data = await TranscriptChunk.find({ spaceId: new mongoose.Types.ObjectId(spaceId as any) }).select('rawText').lean().exec();

    console.log("TranscriptChunk data:", data);


    return SuccessResponse(res, STATUS_CODE.OK, data);


  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

export {
  createSpaceController,
  createStagedNoteController,
  createStagedTaskController,
  deleteSpaceController,
  deleteStagedNoteController,
  deleteStagedTaskController,
  getNoteDateMarkersBySpaceController,
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  getTaskDateMarkersBySpaceController,
  getUserSpacesByUserIdController,
  getUserActiveSpaceController,
  startListningController,
  gettranscriptchunkcontroller,
  updateSpaceController,
  updateStagedNoteController,
  updateStagedTaskController,
  setStagedTaskStatusController,
};
