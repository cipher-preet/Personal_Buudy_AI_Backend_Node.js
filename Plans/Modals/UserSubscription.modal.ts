import mongoose, { Document } from "mongoose";
import type { PlanCode } from "./Plan.modal.js";

export interface IActiveListening {
  spaceId?: mongoose.Types.ObjectId | string;
  startedAt?: Date;
  reportedMs?: number;
}

export interface IUserSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planCode: PlanCode;
  billingInterval?: "forever" | "monthly" | "quarterly";
  status: "active" | "expired" | "cancelled";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  upgradedAt?: Date;
  recordingMsUsed?: number;
  activeListening?: IActiveListening;
}

const userSubscriptionSchema = new mongoose.Schema<IUserSubscription>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planCode: {
      type: String,
      enum: ["free", "pro", "business"],
      required: true,
      index: true,
    },
    billingInterval: {
      type: String,
      enum: ["forever", "monthly", "quarterly"],
      default: "forever",
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    upgradedAt: Date,
    recordingMsUsed: { type: Number, default: 0, min: 0 },
    activeListening: {
      spaceId: { type: mongoose.Schema.Types.Mixed },
      startedAt: Date,
      reportedMs: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true },
);

if (mongoose.models.UserSubscription) {
  mongoose.deleteModel("UserSubscription");
}

const UserSubscription = mongoose.model<IUserSubscription>(
  "UserSubscription",
  userSubscriptionSchema,
);

export default UserSubscription;
