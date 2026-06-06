import bcrypt from "bcryptjs";
import User from "../Modals/user.modal";
import Otp from "../Modals/otp.modal";
import { generateOtp } from "../../utils/generateOtp";
import { sendOtpMail } from "../../utils/sendMail";
import { STATUS_CODE } from "../../Api";

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
