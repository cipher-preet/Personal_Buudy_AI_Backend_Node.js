import { transporter } from "../Config/mail.js";

export const sendOtpMail = async (email: string, otp: string) => {
  await transporter.sendMail({
    from: `"AI Personal Buddy" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Verify Your Account",
    html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>

    <body style="
      margin:0;
      padding:0;
      background:#f4f7fc;
      font-family:Arial, Helvetica, sans-serif;
    ">

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 20px;">

            <table
              width="600"
              cellpadding="0"
              cellspacing="0"
              style="
                background:#ffffff;
                border-radius:16px;
                overflow:hidden;
                box-shadow:0 4px 20px rgba(0,0,0,0.08);
              "
            >

              <!-- Header -->
              <tr>
                <td
                  align="center"
                  style="
                    background:#111827;
                    padding:30px;
                    color:#ffffff;
                  "
                >
                  <h1 style="margin:0;">
                    AI Personal Buddy
                  </h1>

                  <p
                    style="
                      margin-top:10px;
                      color:#d1d5db;
                    "
                  >
                    Secure Account Verification
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td
                  style="
                    padding:40px;
                    color:#374151;
                  "
                >

                  <h2
                    style="
                      margin-top:0;
                      color:#111827;
                    "
                  >
                    Verify your account
                  </h2>

                  <p
                    style="
                      font-size:16px;
                      line-height:24px;
                    "
                  >
                    Hello,
                  </p>

                  <p
                    style="
                      font-size:16px;
                      line-height:24px;
                    "
                  >
                    Use the verification code below to complete your registration.
                  </p>

                  <div
                    style="
                      text-align:center;
                      margin:35px 0;
                    "
                  >
                    <span
                      style="
                        display:inline-block;
                        background:#2563eb;
                        color:#ffffff;
                        padding:18px 40px;
                        font-size:32px;
                        font-weight:bold;
                        letter-spacing:8px;
                        border-radius:12px;
                      "
                    >
                      ${otp}
                    </span>
                  </div>

                  <p
                    style="
                      font-size:15px;
                      color:#6b7280;
                    "
                  >
                    This OTP will expire in
                    <strong>5 minutes</strong>.
                  </p>

                  <p
                    style="
                      font-size:15px;
                      color:#6b7280;
                    "
                  >
                    If you did not request this verification,
                    you can safely ignore this email.
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td
                  align="center"
                  style="
                    background:#f9fafb;
                    padding:25px;
                    color:#6b7280;
                    font-size:13px;
                  "
                >
                  © ${new Date().getFullYear()}
                  AI Personal Buddy

                  <br /><br />

                  This is an automated email.
                  Please do not reply.
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
    `,
  });
};
