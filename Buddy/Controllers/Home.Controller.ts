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
  getNoteWorkspacesServices,
  getProfileSummaryServices,
  getSpaceStatsServices,
  getStagedNoteByIdServices,
  getStagedNotesBySpaceServices,
  getStagedTasksBySpaceServices,
  getUserActiveSpaceServices,
  getUserSpacesByUserIdServices,
  startListningServices,
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

const TITLE_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseRequiredText = (
  value: unknown,
  fieldName: string,
  maxLength: number,
) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${fieldName} is required.` };
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
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

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
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

    const response = await getStagedNotesBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      limit,
      cursor,
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

    const response = await getStagedTasksBySpaceServices(
      userId.trim(),
      spaceId.trim(),
      limit,
      cursor,
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

    const parsedTitle = parseRequiredText(title, "Title", TITLE_MAX_LENGTH);
    if (parsedTitle.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
    }

    const parsedDescription = parseRequiredText(
      description,
      "Description",
      DESCRIPTION_MAX_LENGTH,
    );
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
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      note: response.data?.note,
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

    const parsedTitle = parseRequiredText(title, "Title", TITLE_MAX_LENGTH);
    if (parsedTitle.error) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, parsedTitle.error);
    }

    const parsedDescription = parseRequiredText(
      description,
      "Description",
      DESCRIPTION_MAX_LENGTH,
    );
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
    );

    if (response.status !== STATUS_CODE.CREATED) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Unable to create task.",
      );
    }

    return SuccessResponse(res, response.status, {
      message: response.message,
      task: response.data?.task,
    });
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
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  getUserSpacesByUserIdController,
  getUserActiveSpaceController,
  startListningController,
  gettranscriptchunkcontroller
};
