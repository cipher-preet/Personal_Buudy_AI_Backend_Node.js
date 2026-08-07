import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import { NextFunction, Request, Response } from "express";
import {
  createSpaceService,
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

export {
  createSpaceController,
  getNoteWorkspacesController,
  getProfileSummaryController,
  getSpaceStatsController,
  getStagedNoteByIdController,
  getStagedNotesBySpaceController,
  getStagedTasksBySpaceController,
  getUserSpacesByUserIdController,
  getUserActiveSpaceController,
  startListningController,
};
