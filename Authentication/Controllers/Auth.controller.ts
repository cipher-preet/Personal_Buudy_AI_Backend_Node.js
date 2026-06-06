import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api";
import { NextFunction, Request, Response } from "express";
import User from "../Modals/user.modal";

import { sendOTPServices } from "./../Services/Auth.service";
import bcrypt from "bcryptjs";
import { CustomRequest } from "../../types/types";
import otpModal from "../Modals/otp.modal";

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
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Email and OTP are required",
      );
    }

    const otpRecord: any = await otpModal.findOne({
      email: email,
    });

    if (!otpRecord) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "OTP not found");
    }

    if (otpRecord.otp !== otp) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Invalid OTP");
    }

    if (!otpRecord.expiresAt || otpRecord.expiresAt < new Date()) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "OTP expired");
    }

    const user: any = await User.create({
      email: otpRecord.email,
      password: otpRecord.password,
      provider: "email",
      isVerified: true,
    });

    req.session.user = {
      id: user._id.toString(),
      email: user.email || "",
      name: user.name || "",
    };

    await otpModal.deleteMany({
      email: email,
    });

    return SuccessResponse(res, STATUS_CODE.OK, "OTP verified successfully");
  } catch (error) {
    next(error);
  }
};
//-----------------------------------------------------------------------------------------

const loginController = async (
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
        "Email and password are required",
      );
    }

    const user = await User.findOne({ email });

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return ErrorResponse(
        res,
        STATUS_CODE.UNAUTHORIZED,
        "Invalid credentials",
      );
    }

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };

    return SuccessResponse(res, STATUS_CODE.OK, "Login successful");
  } catch (error) {
    next(error);
  }
};

export default loginController;

//-----------------------------------------------------------------------------------------

export { sendOTPController, verifyOTPController, loginController };
