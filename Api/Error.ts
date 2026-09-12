import { Response } from "express";

const ErrorResponse = (
  res: Response,
  status: number,
  msg: string,
  data?: object,
) => {
  return res.status(status).json({
    success: false,
    message: msg,
    ...(data ? { data } : {}),
  });
};

export { ErrorResponse };
