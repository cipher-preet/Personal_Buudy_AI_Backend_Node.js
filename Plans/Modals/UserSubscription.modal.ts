import mongoose, { Document } from "mongoose";
import type { PlanCode } from "./Plan.modal.js";

export interface IUserSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planCode: PlanCode;
  status: "active" | "expired" | "cancelled";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  upgradedAt?: Date;
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
      enum: ["free", "pro"],
      required: true,
      index: true,
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
  },
  { timestamps: true },
);

const UserSubscription =
  mongoose.models.UserSubscription ||
  mongoose.model<IUserSubscription>(
    "UserSubscription",
    userSubscriptionSchema,
  );

export default UserSubscription;
