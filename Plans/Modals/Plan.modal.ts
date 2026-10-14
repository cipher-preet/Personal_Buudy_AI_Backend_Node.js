import mongoose, { Document } from "mongoose";

export const PLAN_CODES = ["free", "pro", "business"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PlanInterval = "forever" | "monthly" | "yearly";
export type MarketplaceAccess = "none" | "limited" | "full";

export const isPlanCode = (value: string): value is PlanCode =>
  PLAN_CODES.includes(value as PlanCode);

export interface IPlanLimits {
  notesRecordingHours: number;
  meetingRecordingHours: number;
  mindmaps: number;
  documents: number;
  goals: number;
  marketplaceAccess: MarketplaceAccess;
}

export interface IPlan extends Document {
  code: PlanCode;
  name: string;
  description: string;
  amount: number;
  yearlyAmount: number;
  currency: string;
  interval: PlanInterval;
  limits: IPlanLimits;
  languages: string[];
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

const planSchema = new mongoose.Schema<IPlan>(
  {
    code: {
      type: String,
      enum: PLAN_CODES,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    yearlyAmount: { type: Number, required: true, min: 0, default: 0 },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    interval: {
      type: String,
      enum: ["forever", "monthly", "yearly"],
      required: true,
    },
    limits: {
      notesRecordingHours: { type: Number, required: true, min: -1, default: 0 },
      meetingRecordingHours: { type: Number, required: true, min: -1, default: 0 },
      mindmaps: { type: Number, required: true, min: -1, default: 0 },
      documents: { type: Number, required: true, min: -1, default: 0 },
      goals: { type: Number, required: true, min: -1, default: 0 },
      marketplaceAccess: {
        type: String,
        enum: ["none", "limited", "full"],
        required: true,
        default: "none",
      },
    },
    languages: { type: [String], default: [] },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

if (mongoose.models.Plan) {
  mongoose.deleteModel("Plan");
}

const Plan = mongoose.model<IPlan>("Plan", planSchema);

export default Plan;
