import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api";
import { NextFunction, Request, Response } from "express";
import User from "../Modals/user.modal";
import { OAuth2Client } from "google-auth-library";

import { sendOTPServices } from "./../Services/Auth.service";
import bcrypt from "bcryptjs";
import { CustomRequest } from "../../types/types";
import otpModal from "../Modals/otp.modal";
import { generateOtp } from "../../utils/generateOtp";
import { createAuthToken } from "../../utils/authToken";
import { normalizeIndianMobile, sendBlackSmsOtp } from "../../utils/sendSmsOtp";

const googleClient = new OAuth2Client();

const buildAuthPayload = (user: any, isNewUser: boolean) => ({
  token: createAuthToken({
    userId: user._id.toString(),
    provider: user.provider,
  }),
  userId: user._id.toString(),
  isNewUser,
  phone: user.phone,
  email: user.email,
  name: user.name,
  avatar: user.avatar,
});

const setAuthSession = (req: Request, user: any) => {
  (req.session as any).user = {
    id: user._id.toString(),
    email: user.email || "",
    phone: user.phone,
    name: user.name || "",
  };
};

const sendOTPController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password, phone } = req.body;

    if (phone) {
      let normalizedPhone;

      try {
        normalizedPhone = normalizeIndianMobile(phone);
      } catch (error: any) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          error.message || "Invalid mobile number",
        );
      }

      const otp = generateOtp();

      await otpModal.deleteMany({ phone: normalizedPhone.e164Phone });
      await otpModal.create({
        phone: normalizedPhone.e164Phone,
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      try {
        await sendBlackSmsOtp(normalizedPhone.smsPhone, otp);
      } catch (error) {
        await otpModal.deleteMany({ phone: normalizedPhone.e164Phone });
        throw error;
      }

      return SuccessResponse(res, STATUS_CODE.OK, {
        message: "OTP sent successfully",
      });
    }

    if (!email || !password) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Mobile number or email and password are required",
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
    const { email, otp, phone } = req.body;

    if (!otp || (!email && !phone)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Mobile number/email and OTP are required",
      );
    }

    if (phone) {
      let normalizedPhone;

      try {
        normalizedPhone = normalizeIndianMobile(phone);
      } catch (error: any) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          error.message || "Invalid mobile number",
        );
      }

      const otpRecord: any = await otpModal.findOne({
        phone: normalizedPhone.e164Phone,
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

      const userPhone = Number(normalizedPhone.appPhone);
      let user: any = await User.findOne({ phone: userPhone });
      let isNewUser = false;

      if (!user) {
        user = await User.create({
          phone: userPhone,
          provider: "phone",
          isVerified: true,
        });
        isNewUser = true;
      }

      setAuthSession(req, user);

      await otpModal.deleteMany({
        phone: normalizedPhone.e164Phone,
      });

      return SuccessResponse(
        res,
        STATUS_CODE.OK,
        buildAuthPayload(user, isNewUser),
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

    setAuthSession(req, user);

    await otpModal.deleteMany({
      email: email,
    });

    return SuccessResponse(res, STATUS_CODE.OK, buildAuthPayload(user, true));
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

    if (!user.password) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Please login with your original sign-in method",
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return ErrorResponse(
        res,
        STATUS_CODE.UNAUTHORIZED,
        "Invalid credentials",
      );
    }

    setAuthSession(req, user);

    return SuccessResponse(res, STATUS_CODE.OK, buildAuthPayload(user, false));
  } catch (error) {
    next(error);
  }
};

export default loginController;

//-----------------------------------------------------------------------------------------

const googleLoginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { idToken } = req.body;
    const googleClientId =
      process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

    if (!idToken) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Google ID token is required",
      );
    }

    if (!googleClientId) {
      return ErrorResponse(
        res,
        STATUS_CODE.INTERNAL_SERVER_ERROR,
        "Google login is not configured",
      );
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      return ErrorResponse(
        res,
        STATUS_CODE.UNAUTHORIZED,
        "Invalid Google account",
      );
    }

    let user: any = await User.findOne({
      $or: [{ googleId: payload.sub }, { email: payload.email }],
    });
    let isNewUser = false;

    if (!user) {
      user = await User.create({
        name: payload.name,
        email: payload.email,
        googleId: payload.sub,
        avatar: payload.picture,
        provider: "google",
        isVerified: payload.email_verified ?? true,
      });
      isNewUser = true;
    } else if (!user.googleId) {
      user.googleId = payload.sub;
      user.avatar = user.avatar || payload.picture;
      user.name = user.name || payload.name;
      user.isVerified = true;
      await user.save();
    }

    setAuthSession(req, user);

    return SuccessResponse(
      res,
      STATUS_CODE.OK,
      buildAuthPayload(user, isNewUser),
    );
  } catch (error) {
    next(error);
  }
};

const completeOnboardingController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, profession, usageGoal, source } = req.body;

    if (!userId || !profession || !usageGoal || !source) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "User id, profession, usage goal, and source are required",
      );
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        onboarding: {
          profession,
          usageGoal,
          source,
          completedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    return SuccessResponse(res, STATUS_CODE.OK, {
      message: "Onboarding completed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getMeController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authUser = req.authUser || req.session?.user;

    if (!authUser?.id) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const user = await User.findById(authUser.id).select(
      "-password -__v -createdAt -updatedAt",
    );

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    return SuccessResponse(res, STATUS_CODE.OK, {
      user,
      sessionAuthenticated: Boolean(req.session?.user?.id),
    });
  } catch (error) {
    next(error);
  }
};

const checkAuthController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authUser = req.authUser || req.session?.user;

    if (!authUser?.id) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Session is not active");
    }

    const user: any = await User.findById(authUser.id).select(
      "-password -__v -createdAt -updatedAt",
    );

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Session is not active");
    }

    const hasCompletedOnboarding = Boolean(user.onboarding?.completedAt);

    return SuccessResponse(res, STATUS_CODE.OK, {
      authenticated: true,
      userId: user._id.toString(),
      phone: user.phone,
      email: user.email,
      name: user.name,
      isNewUser: !hasCompletedOnboarding,
      hasCompletedOnboarding,
      sessionAuthenticated: Boolean(req.session?.user?.id),
    });
  } catch (error) {
    next(error);
  }
};

const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.session.destroy((error) => {
      if (error) {
        return next(error);
      }

      res.clearCookie("b2b.sid");

      return SuccessResponse(res, STATUS_CODE.OK, {
        message: "Logout successful",
      });
    });
  } catch (error) {
    next(error);
  }
};

export {
  sendOTPController,
  verifyOTPController,
  loginController,
  googleLoginController,
  completeOnboardingController,
  checkAuthController,
  getMeController,
  logoutController,
};
