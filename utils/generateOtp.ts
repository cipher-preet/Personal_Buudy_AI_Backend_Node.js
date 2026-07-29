import otpGenerator from 'otp-generator';

export const generateOtp = () => {
  return otpGenerator.generate(4, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });
};
