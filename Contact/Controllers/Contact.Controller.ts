import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import { submitContactService } from "../Services/Contact.services.js";

export const submitContactController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const response = await submitContactService(req.body, req.ip || "");

    if (!response.data) {
      return ErrorResponse(
        res,
        response.status || STATUS_CODE.BAD_REQUEST,
        response.message || "Could not send your message.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
