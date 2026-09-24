import { NextFunction, Response } from "express";
import { STATUS_CODE } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import { verifyAuthToken } from "../../utils/authToken.js";

export const requireAuth = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const sessionUser = req.session?.user;

  if (sessionUser?.id) {
    req.authUser = {
      id: sessionUser.id,
      email: sessionUser.email,
      phone: sessionUser.phone,
      name: sessionUser.name,
    };

    return next();
  }

  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const queryToken =
    typeof req.query?.access_token === "string" ? req.query.access_token.trim() : null;
  const token = headerToken || queryToken;

  if (token) {
    const payload = verifyAuthToken(token);

    if (payload?.userId) {
      req.authUser = {
        id: payload.userId,
        provider: payload.provider,
      };

      return next();
    }
  }

  return res.status(STATUS_CODE.UNAUTHORIZED).json({
    success: false,
    message: "Unauthorized",
  });
};
