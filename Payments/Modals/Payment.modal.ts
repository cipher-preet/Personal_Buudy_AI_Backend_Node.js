import mongoose, { Document } from "mongoose";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planCode: string;
  amount: number;
  currency: string;
  status:
    | "created"
    | "attempted"
    | "paid"
    | "failed"
    | "refunded"
    | "cancelled";
  razorpayOrderId: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkUrl?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  receipt: string;
  rawOrder?: Record<string, unknown>;
  rawPayment?: Record<string, unknown>;
  webhookEvents: string[];
  paidAt?: Date;
  failedAt?: Date;
}

const paymentSchema = new mongoose.Schema<IPayment>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planCode: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
    },
    status: {
      type: String,
      enum: ["created", "attempted", "paid", "failed", "refunded", "cancelled"],
      default: "created",
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      sparse: true,
      index: true,
    },
    razorpayPaymentLinkId: {
      type: String,
      sparse: true,
      index: true,
    },
    razorpayPaymentLinkUrl: String,
    razorpaySignature: String,
    receipt: {
      type: String,
      required: true,
      unique: true,
    },
    rawOrder: {
      type: mongoose.Schema.Types.Mixed,
    },
    rawPayment: {
      type: mongoose.Schema.Types.Mixed,
    },
    webhookEvents: {
      type: [String],
      default: [],
    },
    paidAt: Date,
    failedAt: Date,
  },
  { timestamps: true },
);

const Payment =
  mongoose.models.Payment || mongoose.model<IPayment>("Payment", paymentSchema);

export default Payment;
