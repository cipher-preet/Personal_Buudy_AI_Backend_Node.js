import mongoose, { Document } from "mongoose";

export type PlanCode = "free" | "pro";

export interface IPlanLimits {
  spaces: number;
  notes: number;
  tasks: number;
}

export interface IPlan extends Document {
  code: PlanCode;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: "forever" | "monthly";
  limits: IPlanLimits;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

const planSchema = new mongoose.Schema<IPlan>(
  {
    code: {
      type: String,
      enum: ["free", "pro"],
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    interval: {
      type: String,
      enum: ["forever", "monthly"],
      required: true,
    },
    limits: {
      spaces: { type: Number, required: true, min: -1 },
      notes: { type: Number, required: true, min: -1 },
      tasks: { type: Number, required: true, min: -1 },
    },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Plan = mongoose.models.Plan || mongoose.model<IPlan>("Plan", planSchema);

export default Plan;
