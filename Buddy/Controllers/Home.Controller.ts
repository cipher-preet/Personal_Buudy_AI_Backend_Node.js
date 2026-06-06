import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api";
import { NextFunction, Request, Response } from "express";
import {
  createSpaceService,
  getUserActiveSpaceServices,
  getUserSpacesByUserIdServices,
  startListningServices,
} from "../Services/Home.services";

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

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
    }

    SuccessResponse(res, response.status, response.message);
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
    const { spaceId } = req.body;

    const response = await startListningServices(spaceId);

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
    }

    SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//--------------------------------------------------------------------------------

export {
  createSpaceController,
  getUserSpacesByUserIdController,
  getUserActiveSpaceController,
  startListningController,
};
