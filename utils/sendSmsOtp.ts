const BLACKSMS_SMS_URL = "https://blacksms.in/sms";

export const normalizeIndianMobile = (phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return {
      appPhone: digits,
      e164Phone: `+91${digits}`,
      smsPhone: digits,
    };
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return {
      appPhone: digits.slice(2),
      e164Phone: `+${digits}`,
      smsPhone: digits,
    };
  }

  throw new Error("Enter a valid Indian mobile number");
};

export const sendBlackSmsOtp = async (phone: string, otp: string) => {
  const apiKey = process.env.BLACKSMS_API_KEY;
  const senderId = process.env.BLACKSMS_SENDER_ID;

  if (!apiKey) {
    throw new Error("SMS service is not configured");
  }

  if (!senderId) {
    throw new Error("SMS sender id is not configured");
  }

  const body: Record<string, string> = {
    numbers: phone,
    message: `Your MyBuddy OTP is ${otp}. Valid for 5 minutes. -BLACKSMS`,
    sender_id: senderId,
    variables_values: otp,
  };

  if (process.env.BLACKSMS_ROUTE) {
    body.route = process.env.BLACKSMS_ROUTE;
  }

  if (process.env.BLACKSMS_DLT_TEMPLATE_ID) {
    body.dlt_template_id = process.env.BLACKSMS_DLT_TEMPLATE_ID;
  }

  if (process.env.BLACKSMS_DLT_ENTITY_ID) {
    body.dlt_entity_id = process.env.BLACKSMS_DLT_ENTITY_ID;
  }

  const response = await fetch(process.env.BLACKSMS_API_URL || BLACKSMS_SMS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `BlackSMS request failed with ${response.status}: ${responseText}`,
    );
  }
};
