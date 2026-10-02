import { NextFunction, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { searchWorkspaceServices } from "../Services/Search.services.js";
import { MAX_QUERY_LENGTH, SEARCH_TYPES, type SearchType } from "../Services/searchQuery.js";

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const parseTypes = (value: unknown): SearchType[] => {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  const allowed = new Set<string>(SEARCH_TYPES);
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is SearchType => allowed.has(part));
};

export const searchWorkspaceController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const q = typeof req.query.q === "string" ? req.query.q.slice(0, MAX_QUERY_LENGTH) : "";
    const limitValue = Number(req.query.limit);
    const response = await searchWorkspaceServices({
      userId: String(userId),
      q,
      limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined,
      types: parseTypes(req.query.types),
      timeZone: typeof req.query.tz === "string" ? req.query.tz : undefined,
    });

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};
