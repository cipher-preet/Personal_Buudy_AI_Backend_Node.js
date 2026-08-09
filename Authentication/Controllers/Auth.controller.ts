import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import User from "../Modals/user.modal.js";
import { OAuth2Client } from "google-auth-library";

import { sendOTPServices } from "./../Services/Auth.service.js";
import bcrypt from "bcryptjs";
import type { CustomRequest } from "../../types/types.js";
import otpModal from "../Modals/otp.modal.js";
import { generateOtp } from "../../utils/generateOtp.js";
import { createAuthToken } from "../../utils/authToken.js";
import { normalizeIndianMobile, sendBlackSmsOtp } from "../../utils/sendSmsOtp.js";
import { uploadProfileImageToS3 } from "../../Config/s3.js";
import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import { StagedNotes, StagedTasks } from "../../Buddy/Modals/Staged.Modal.js";

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

const normalizeUsername = (username: unknown) => {
  if (typeof username !== "string") {
    return "";
  }

  return username.trim().replace(/\s+/g, " ");
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

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

const checkPhoneController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Mobile number is required",
      );
    }

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

    const userPhone = Number(normalizedPhone.appPhone);
    const user = await User.findOne({ phone: userPhone }).select(
      "_id name phone onboarding",
    );

    return SuccessResponse(res, STATUS_CODE.OK, {
      exists: Boolean(user),
      phone: userPhone,
      name: user?.name,
      hasCompletedOnboarding: Boolean((user as any)?.onboarding?.completedAt),
    });
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
    const { email, otp, phone, username } = req.body;

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
        const normalizedUsername = normalizeUsername(username);

        if (!normalizedUsername || normalizedUsername.length < 2) {
          return ErrorResponse(
            res,
            STATUS_CODE.BAD_REQUEST,
            "Username is required",
          );
        }

        user = await User.create({
          name: normalizedUsername,
          phone: userPhone,
          provider: "phone",
          isVerified: true,
        });
        isNewUser = true;
      } else if (!user.name) {
        const normalizedUsername = normalizeUsername(username);

        if (normalizedUsername) {
          user.name = normalizedUsername;
          await user.save();
        }
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
      avatar: user.avatar,
      isNewUser: !hasCompletedOnboarding,
      hasCompletedOnboarding,
      sessionAuthenticated: Boolean(req.session?.user?.id),
    });
  } catch (error) {
    next(error);
  }
};

const updateMeController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authUser = req.authUser || req.session?.user;

    if (!authUser?.id) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const user: any = await User.findById(authUser.id);

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    const nextName = normalizeUsername(req.body.name);
    const nextEmail = normalizeOptionalString(req.body.email).toLowerCase();
    const nextPhone = normalizeOptionalString(req.body.phone);

    if (nextName) {
      if (nextName.length < 2) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Name must be at least 2 characters",
        );
      }

      user.name = nextName;
    }

    if (nextEmail && !user.email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(nextEmail)) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Enter a valid email address",
        );
      }

      const existingEmailUser = await User.findOne({
        email: nextEmail,
        _id: { $ne: user._id },
      });

      if (existingEmailUser) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Email is already in use",
        );
      }

      user.email = nextEmail;
    }

    if (nextPhone && !user.phone) {
      let normalizedPhone;

      try {
        normalizedPhone = normalizeIndianMobile(nextPhone);
      } catch (error: any) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          error.message || "Invalid mobile number",
        );
      }

      const userPhone = Number(normalizedPhone.appPhone);
      const existingPhoneUser = await User.findOne({
        phone: userPhone,
        _id: { $ne: user._id },
      });

      if (existingPhoneUser) {
        return ErrorResponse(
          res,
          STATUS_CODE.BAD_REQUEST,
          "Phone number is already in use",
        );
      }

      user.phone = userPhone;
    }

    await user.save();
    setAuthSession(req, user);

    return SuccessResponse(res, STATUS_CODE.OK, {
      userId: user._id.toString(),
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    });
  } catch (error) {
    next(error);
  }
};

const updateAvatarController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authUser = req.authUser || req.session?.user;

    if (!authUser?.id) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (!req.file) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Profile image is required",
      );
    }

    const user: any = await User.findById(authUser.id);

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    const uploadedImage = await uploadProfileImageToS3({
      userId: user._id.toString(),
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });

    user.avatar = uploadedImage.url;
    await user.save();
    setAuthSession(req, user);

    return SuccessResponse(res, STATUS_CODE.OK, {
      userId: user._id.toString(),
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
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

const deleteAccountController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { confirmation } = req.body;

    if (!userId) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    if (confirmation !== "DELETE") {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        'Type "DELETE" to confirm account deletion',
      );
    }

    if (!mongoose.isValidObjectId(userId)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid authenticated user",
      );
    }

    const user: any = await User.findById(userId);

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    const userFilter = createIdFilter(String(user._id));

    const [spacesResult, notesResult, tasksResult] = await Promise.all([
      CreateSpace.deleteMany({ userId: userFilter }),
      StagedNotes.deleteMany({ userId: userFilter }),
      StagedTasks.deleteMany({ userId: userFilter }),
    ]);

    await User.findByIdAndDelete(user._id);

    req.session?.destroy(error => {
      if (error) {
        return next(error);
      }

      res.clearCookie("b2b.sid");

      return SuccessResponse(res, STATUS_CODE.OK, {
        message: "Account deleted successfully",
        deleted: {
          spaces: spacesResult.deletedCount ?? 0,
          notes: notesResult.deletedCount ?? 0,
          tasks: tasksResult.deletedCount ?? 0,
        },
      });
    });
  } catch (error) {
    next(error);
  }
};

export {
  sendOTPController,
  checkPhoneController,
  verifyOTPController,
  loginController,
  googleLoginController,
  completeOnboardingController,
  checkAuthController,
  getMeController,
  updateMeController,
  updateAvatarController,
  logoutController,
  deleteAccountController,
};
