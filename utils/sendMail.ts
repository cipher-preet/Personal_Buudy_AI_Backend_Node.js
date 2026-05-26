import { transporter }
from '../Config/mail';

export const sendOtpMail = async (
  email: string,
  otp: string
) => {
  await transporter.sendMail({
    from: process.env.MAIL_USER,

    to: email,

    subject: 'Verify Your Account',

    html: `
      <div>
        <h2>Your OTP is ${otp}</h2>
        <p>OTP valid for 5 minutes.</p>
      </div>
    `,
  });
};