import { NextFunction, Response } from "express";
import { STATUS_CODE } from "../../Api";
import { CustomRequest } from "../../types/types";
import { verifyAuthToken } from "../../utils/authToken";

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
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

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
