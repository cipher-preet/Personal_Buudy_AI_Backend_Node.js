import {
  sendOTPRepository,
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




