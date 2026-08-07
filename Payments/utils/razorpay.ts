import crypto from "crypto";
import Razorpay from "razorpay";

const getRazorpayConfig = () => {
  const keyId =
    process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY_ID;
  const keySecret =
    process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_TEST_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay test keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Node_Backend/.env, or use RAZORPAY_TEST_KEY_ID and RAZORPAY_TEST_KEY_SECRET.",
    );
  }

  return { keyId, keySecret };
};

export const getRazorpayKeyId = () => {
  const { keyId } = getRazorpayConfig();
  return keyId;
};

export const getRazorpayInstance = () => {
  const { keyId, keySecret } = getRazorpayConfig();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

const getRazorpayAuthHeader = () => {
  const { keyId, keySecret } = getRazorpayConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

const requestRazorpay = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  let response: Response | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        ...options,
        headers: {
          Authorization: getRazorpayAuthHeader(),
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      break;
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1200));
      }
    }
  }

  if (!response) {
    const message =
      lastError instanceof Error
        ? lastError.message
        : "Unable to connect to Razorpay.";
    throw new Error(`Razorpay connection failed: ${message}`);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.error?.description ||
      body?.error?.reason ||
      body?.message ||
      `Razorpay request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
};

export const createRazorpayOrder = (payload: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) =>
  requestRazorpay<Record<string, any>>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchRazorpayPayment = (paymentId: string) =>
  requestRazorpay<Record<string, any>>(`/payments/${paymentId}`);

export const createRazorpayPaymentLink = (payload: {
  amount: number;
  currency: string;
  reference_id: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notify?: {
    sms?: boolean;
    email?: boolean;
  };
  notes: Record<string, string>;
}) =>
  requestRazorpay<Record<string, any>>("/payment_links", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const timingSafeEqualHex = (expected: string, received: string) => {
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

export const verifyCheckoutSignature = ({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { keySecret } = getRazorpayConfig();
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return timingSafeEqualHex(expectedSignature, signature);
};

export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string | undefined,
) => {
  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    process.env.RAZORPAY_TEST_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      "Razorpay webhook secret is missing. Set RAZORPAY_WEBHOOK_SECRET or RAZORPAY_TEST_WEBHOOK_SECRET in Node_Backend/.env.",
    );
  }

  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqualHex(expectedSignature, signature);
};
