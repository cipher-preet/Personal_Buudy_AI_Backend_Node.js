import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import type { CustomRequest } from "../../types/types.js";
import {
  createPaymentLinkService,
  createPaymentOrderService,
  handlePaymentWebhookService,
  verifyPaymentService,
} from "../Services/Payment.services.js";
import { verifyWebhookSignature } from "../utils/razorpay.js";

export const createPaymentOrderController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, planCode } = req.body;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (!userId || !planCode) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "User id and plan code are required.",
      );
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await createPaymentOrderService(
      String(userId),
      String(planCode) === "free" ? "free" : "pro",
    );

    if (!response.data) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const verifyPaymentController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      userId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (
      !userId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Payment verification fields are required.",
      );
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await verifyPaymentService({
      userId: String(userId),
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
      razorpaySignature: String(razorpay_signature),
    });

    if (!response.data) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const createPaymentLinkController = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { userId, planCode, name, email, phone } = req.body;
    const authUserId = req.authUser?.id || req.session?.user?.id;

    if (!userId || !planCode) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "User id and plan code are required.",
      );
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
    }

    const response = await createPaymentLinkService({
      userId: String(userId),
      planCode: String(planCode) === "free" ? "free" : "pro",
      name: typeof name === "string" ? name : undefined,
      email: typeof email === "string" ? email : undefined,
      phone: phone ? String(phone) : undefined,
    });

    if (!response.data) {
      return ErrorResponse(res, response.status, response.message);
    }

    return SuccessResponse(res, response.status, response.data);
  } catch (error) {
    next(error);
  }
};

export const razorpayWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));
    const signature = req.headers["x-razorpay-signature"];
    const isValid = verifyWebhookSignature(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
    );

    if (!isValid) {
      return ErrorResponse(
        res,
        STATUS_CODE.UNAUTHORIZED,
        "Invalid webhook signature.",
      );
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    res.status(200).json({ success: true });

    handlePaymentWebhookService(payload).catch(error => {
      console.error("Razorpay webhook processing failed", error);
    });
  } catch (error) {
    next(error);
  }
};
