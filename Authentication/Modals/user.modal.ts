import mongoose from "mongoose";
import { Document } from "mongoose";

export interface IUser extends Document {
  name?: string;
  email?: string;
  phone?: number;
  password?: string;
  googleId?: string;
  provider: "email" | "google" | "phone";
  avatar?: string;
  isVerified: boolean;
  onboarding?: {
    profession?: string;
    usageGoal?: string;
    source?: string;
    completedAt?: Date;
  };
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: String,

    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: Number,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
    },

    googleId: String,

    provider: {
      type: String,
      enum: ["email", "google", "phone"],
      required: true,
    },

    avatar: String,

    isVerified: {
      type: Boolean,
      default: false,
    },

    onboarding: {
      profession: String,
      usageGoal: String,
      source: String,
      completedAt: Date,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>("User", userSchema);
