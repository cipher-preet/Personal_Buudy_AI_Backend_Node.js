import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api";
import { NextFunction, Request, Response } from "express";
import { sendOTPServices, verifyOTPServices } from "./../Services/Auth.service";

const sendOTPController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "All Fields are madatory",
      );
    }

    const response = await sendOTPServices(email, password);

    if (response.status === STATUS_CODE.NOT_FOUND) {
      return ErrorResponse(res, response.status, response.message);
    }

    SuccessResponse(res, response.status, response.message);
  } catch (error) {
    next(error);
  }
};

//-------------------------------------------------------------------------

const verifyOTPController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, otp } = req.body;

    const response = await verifyOTPServices(req, email, otp);

    if (response.status === STATUS_CODE.BAD_REQUEST) {
      return ErrorResponse(res, response.status, response.message);
    }

    SuccessResponse(res, response.status, response);
  } catch (error) {
    next(error);
  }
};

//-----------------------------------------------------------------------------------------

export { sendOTPController, verifyOTPController };
