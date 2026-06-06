import mongoose from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  googleId?: string;
  provider: "email" | "google";
  avatar?: string;
  isVerified: boolean;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: String,

    email: {
      type: String,
      required: true, 
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
    },

    googleId: String,

    provider: {
      type: String,
      enum: ["email", "google"],
    },

    avatar: String,

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>("User", userSchema);
