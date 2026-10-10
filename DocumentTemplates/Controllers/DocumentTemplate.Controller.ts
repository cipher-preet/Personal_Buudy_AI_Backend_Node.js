import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import {
  getDocumentTemplateByCodeService,
  getDocumentTemplatesService,
} from "../Services/DocumentTemplate.services.js";

export const getDocumentTemplatesController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const response = await getDocumentTemplatesService();
    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const getDocumentTemplateByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = String(req.params.id || "").trim();

    if (!code) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Template id is required.");
    }

    const response = await getDocumentTemplateByCodeService(code);

    if (!response.data) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Document template not found.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
