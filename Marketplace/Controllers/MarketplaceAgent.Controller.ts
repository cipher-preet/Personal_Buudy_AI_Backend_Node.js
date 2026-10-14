import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import {
  getMarketplaceAgentByCodeService,
  getMarketplaceAgentsService,
} from "../Services/MarketplaceAgent.services.js";

export const getMarketplaceAgentsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const response = await getMarketplaceAgentsService({
      page: req.query.page,
      limit: req.query.limit,
    });
    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const getMarketplaceAgentByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = String(req.params.id || "").trim();

    if (!code) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Agent id is required.");
    }

    const response = await getMarketplaceAgentByCodeService(code);

    if (!response.data) {
      return ErrorResponse(
        res,
        response.status,
        response.message || "Marketplace agent not found.",
      );
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
