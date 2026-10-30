import { NextFunction, Response } from "express";

import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { sendMailCheck, MailValidationError } from "../sendCheck.service.js";
import { MailConfigError, MailDeliveryError } from "../zohoEmailAdapter.js";

export const sendMailCheckController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await sendMailCheck(req.body);
    return SuccessResponse(res, STATUS_CODE.OK, result);
  } catch (error) {
    if (error instanceof MailValidationError) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, error.message);
    }
    if (error instanceof MailConfigError || error instanceof MailDeliveryError) {
      return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, error.message);
    }
    next(error);
  }
};
