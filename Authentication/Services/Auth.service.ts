import { CustomRequest } from "../../types/types";
import {
  sendOTPRepository,
  verifyOTPRepository,
} from "../Repository/Auth.repository";

export const sendOTPServices = async (email: string, password: string) => {
  try {
    const response = await sendOTPRepository(email, password);
    return response;
  } catch (error) {
    console.log("error Auth service Layer ", error);
    throw error;
  }
};

//-----------------------------------------------------------------------------------------

export const verifyOTPServices = async (
  req: CustomRequest,
  email: string,
  otp: string,
) => {
  try {
    const response = await verifyOTPRepository(req, email, otp);
    return response;
  } catch (error) {
    console.log("error Auth service Layer ", error);
    throw error;
  }
};
