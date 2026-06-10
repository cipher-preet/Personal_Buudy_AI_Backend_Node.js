import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api";
import { NextFunction, Request, Response } from "express";
import { getNotesByUserIdServices } from "../Services/Notes.Services";

const getNotesByUserIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    const spaceId = req.query.spaceId as string;
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
    if (!spaceId || spaceId.trim().length === 0) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Missing 'spaceId' query parameter.",
      );
    }

    const response = await getNotesByUserIdServices(
      userId,
      spaceId,
      limit,
      cursor as string,
    );

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, STATUS_CODE.OK, response);
  } catch (error) {
    next(error);
  }
};

//-----------------------------------------------------------------------------------------

export { getNotesByUserIdController };
