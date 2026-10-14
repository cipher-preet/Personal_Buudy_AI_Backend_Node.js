import mongoose, { Document } from "mongoose";

export type MarketplaceInstallTier = "pro" | "business";
export type MarketplaceAgentTone =
  | "blue"
  | "red"
  | "navy"
  | "teal"
  | "orange"
  | "purple"
  | "green";

export interface IMarketplaceAgent extends Document {
  code: string;
  title: string;
  description: string;
  author: string;
  installs: string;
  tone: MarketplaceAgentTone;
  icon: string;
  installTier: MarketplaceInstallTier;
  isActive: boolean;
  sortOrder: number;
}

const marketplaceAgentSchema = new mongoose.Schema<IMarketplaceAgent>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true, default: "Kuku Labs" },
    installs: { type: String, required: true, trim: true, default: "0" },
    tone: {
      type: String,
      required: true,
      enum: ["blue", "red", "navy", "teal", "orange", "purple", "green"],
      default: "blue",
    },
    icon: { type: String, required: true, trim: true, default: "sparkles" },
    installTier: {
      type: String,
      required: true,
      enum: ["pro", "business"],
      default: "pro",
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

marketplaceAgentSchema.index({ isActive: 1, sortOrder: 1 });

if (mongoose.models.MarketplaceAgent) {
  mongoose.deleteModel("MarketplaceAgent");
}

const MarketplaceAgent = mongoose.model<IMarketplaceAgent>(
  "MarketplaceAgent",
  marketplaceAgentSchema,
);

export default MarketplaceAgent;
