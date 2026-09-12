import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { getPlanByCode, activatePlanForUser, getPlanChargeAmount } from "../../Plans/Services/Plan.services.js";
import type { PlanCode, PlanInterval } from "../../Plans/Modals/Plan.modal.js";
import Payment from "../Modals/Payment.modal.js";
import {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  verifyCheckoutSignature,
} from "../utils/razorpay.js";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
        captured?: boolean;
        created_at?: number;
      };
    };
    order?: {
      entity?: {
        id?: string;
        status?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        status?: string;
        short_url?: string;
      };
    };
  };
};

const makeReceipt = (userId: string, planCode: string, interval: string) =>
  `rcpt_${planCode}_${interval}_${userId.slice(-8)}_${Date.now()}`;

export const createPaymentOrderService = async (
  userId: string,
  planCode: PlanCode,
  interval: Extract<PlanInterval, "monthly" | "quarterly"> = "monthly",
) => {
  if (!mongoose.isValidObjectId(userId)) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Invalid user id.",
    };
  }

  if (planCode === "free") {
    const freePlan = await getPlanByCode("free");

    if (!freePlan) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Free plan is not configured.",
      };
    }

    const subscription = await activatePlanForUser(
      userId,
      freePlan._id,
      "free",
      "forever",
    );

    return {
      status: STATUS_CODE.OK,
      data: {
        message: "Free plan activated.",
        requiresPayment: false,
        subscription,
      },
    };
  }

  const plan = await getPlanByCode(planCode);

  if (!plan || !plan.isActive) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Selected plan is not available.",
    };
  }

  const amount = getPlanChargeAmount(plan, interval);

  if (!amount) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Selected billing cycle is not available for this plan.",
    };
  }

  const receipt = makeReceipt(userId, plan.code, interval);
  let order: Record<string, any>;

  try {
    order = await createRazorpayOrder({
      amount,
      currency: plan.currency,
      receipt,
      notes: {
        userId,
        planCode: plan.code,
        interval,
      },
    });
  } catch (error: any) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: error.message || "Unable to create Razorpay order.",
    };
  }

  const payment = await Payment.create({
    userId,
    planId: plan._id,
    planCode: plan.code,
    amount,
    currency: plan.currency,
    status: "created",
    razorpayOrderId: order.id,
    receipt,
    billingInterval: interval,
    rawOrder: order,
  });

  return {
    status: STATUS_CODE.CREATED,
    data: {
      keyId: getRazorpayKeyId(),
      orderId: order.id,
      amount,
      currency: plan.currency,
      plan,
      interval,
      paymentId: payment._id,
      requiresPayment: true,
    },
  };
};

export const createPaymentLinkService = async ({
  userId,
  planCode,
  name,
  email,
  phone,
  interval = "monthly",
}: {
  userId: string;
  planCode: PlanCode;
  name?: string;
  email?: string;
  phone?: string;
  interval?: Extract<PlanInterval, "monthly" | "quarterly">;
}) => {
  if (!mongoose.isValidObjectId(userId)) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Invalid user id.",
    };
  }

  const plan = await getPlanByCode(planCode);

  if (!plan || !plan.isActive || plan.code === "free") {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Selected paid plan is not available.",
    };
  }

  const amount = getPlanChargeAmount(plan, interval);

  if (!amount) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Selected billing cycle is not available for this plan.",
    };
  }

  const receipt = makeReceipt(userId, plan.code, interval);

  try {
    const link = await createRazorpayPaymentLink({
      amount,
      currency: plan.currency,
      reference_id: receipt,
      description: `${plan.name} ${interval} subscription`,
      customer: {
        name,
        email,
        contact: phone,
      },
      notify: {
        sms: false,
        email: false,
      },
      notes: {
        userId,
        planCode: plan.code,
        interval,
      },
    });

    const payment = await Payment.create({
      userId,
      planId: plan._id,
      planCode: plan.code,
      amount,
      currency: plan.currency,
      status: "created",
      razorpayOrderId: link.id,
      razorpayPaymentLinkId: link.id,
      razorpayPaymentLinkUrl: link.short_url,
      receipt,
      billingInterval: interval,
      rawOrder: link,
    });

    return {
      status: STATUS_CODE.CREATED,
      data: {
        paymentId: payment._id,
        paymentLinkId: link.id,
        paymentLinkUrl: link.short_url,
        plan,
        interval,
        requiresPayment: true,
      },
    };
  } catch (error: any) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: error.message || "Unable to create Razorpay payment link.",
    };
  }
};

export const verifyPaymentService = async ({
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) => {
  const payment = await Payment.findOne({
    userId,
    razorpayOrderId,
  });

  if (!payment) {
    return {
      status: STATUS_CODE.NOT_FOUND,
      message: "Payment order not found.",
    };
  }

  const isValid = verifyCheckoutSignature({
    orderId: payment.razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!isValid) {
    payment.status = "failed";
    payment.failedAt = new Date();
    await payment.save();

    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Payment signature verification failed.",
    };
  }

  let fetchedPayment: Record<string, any>;

  try {
    fetchedPayment = await fetchRazorpayPayment(razorpayPaymentId);
  } catch (error: any) {
    payment.status = "attempted";
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.rawPayment = {
      id: razorpayPaymentId,
      order_id: payment.razorpayOrderId,
      signatureVerified: true,
      fetchError:
        error?.message ||
        "Unable to fetch payment status from Razorpay after verification.",
    };
    await payment.save();

    return {
      status: STATUS_CODE.BAD_REQUEST,
      message:
        "Payment signature is valid, but Razorpay status confirmation timed out. Please retry verification or wait for webhook confirmation.",
    };
  }

  const fetchedStatus = String(fetchedPayment.status || "");

  if (!["authorized", "captured"].includes(fetchedStatus)) {
    payment.status = fetchedStatus === "failed" ? "failed" : "attempted";
    payment.rawPayment = fetchedPayment;
    await payment.save();

    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: `Payment is not successful yet. Current status: ${fetchedStatus}`,
    };
  }

  payment.status = "paid";
  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.rawPayment = fetchedPayment;
  payment.paidAt = new Date();
  await payment.save();

  const subscription = await activatePlanForUser(
    userId,
    payment.planId,
    payment.planCode as PlanCode,
    payment.billingInterval || "monthly",
  );

  return {
    status: STATUS_CODE.OK,
    data: {
      message: "Payment verified and plan upgraded.",
      payment,
      subscription,
    },
  };
};

export const handlePaymentWebhookService = async (
  payload: RazorpayWebhookPayload,
) => {
  const event = payload.event || "unknown";
  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const paymentLinkEntity = payload.payload?.payment_link?.entity;
  const orderId =
    paymentEntity?.order_id || orderEntity?.id || paymentLinkEntity?.id;

  if (!orderId) {
    return;
  }

  const payment = await Payment.findOne({
    $or: [{ razorpayOrderId: orderId }, { razorpayPaymentLinkId: orderId }],
  });

  if (!payment || payment.webhookEvents.includes(event)) {
    return;
  }

  payment.webhookEvents.push(event);

  if (
    event === "payment.captured" ||
    event === "order.paid" ||
    event === "payment_link.paid"
  ) {
    payment.status = "paid";
    payment.razorpayPaymentId = paymentEntity?.id || payment.razorpayPaymentId;
    payment.rawPayment = paymentEntity || payment.rawPayment;
    payment.paidAt = payment.paidAt || new Date();

    await activatePlanForUser(
      String(payment.userId),
      payment.planId,
      payment.planCode as PlanCode,
      payment.billingInterval || "monthly",
    );
  }

  if (event === "payment.failed") {
    payment.status = "failed";
    payment.razorpayPaymentId = paymentEntity?.id || payment.razorpayPaymentId;
    payment.rawPayment = paymentEntity || payment.rawPayment;
    payment.failedAt = payment.failedAt || new Date();
  }

  await payment.save();
};
