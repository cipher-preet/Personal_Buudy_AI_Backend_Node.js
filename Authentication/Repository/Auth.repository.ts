import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import User from "../Modals/user.modal";
import Otp from "../Modals/otp.modal";
import { generateOtp } from "../../utils/generateOtp";
import { sendOtpMail } from "../../utils/sendMail";
import { STATUS_CODE } from "../../Api";
import { CustomRequest } from "../../types/types";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const sendOTPRepository = async (email: string, password: string) => {
  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Email already exists",
      };
    }

    const otp = generateOtp();

    const hashedPassword = await bcrypt.hash(password, 12);

    await Otp.deleteMany({ email });

    await Otp.create({
      email,
      password: hashedPassword,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await sendOtpMail(email, otp);

    return {
      status: STATUS_CODE.OK,
      message: "OTP sent successfully",
    };
  } catch (error) {
    console.log("error Auth Repository Layer ", error);
    throw error;
  }
};

//-----------------------------------------------------------------------------------------------------

export const verifyOTPRepository = async (
  req: CustomRequest,
  email: string,
  otp: string,
) => {
  try {
    const otpRecord = await Otp.findOne({ email });

    if (!otpRecord) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "OTP not found",
      };
    }

    console.log("otpRecord.otp ", otpRecord.otp);

    if (otpRecord.otp !== otp) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid OTP",
      };
    }

    if (!otpRecord.expiresAt || otpRecord.expiresAt < new Date()) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "OTP expired",
      };
    }

    const user = await User.create({
      email: otpRecord.email,

      password: otpRecord.password,

      provider: "email",

      isVerified: true,
    });

    req.session.userId = user._id.toString();

    await Otp.deleteMany({
      email,
    });

    return {
      status: STATUS_CODE.OK,
      message: "Registration successful",
      user,
    };
  } catch (error) {
    console.log("error Auth Repository Layer ", error);
    throw error;
  }
};
