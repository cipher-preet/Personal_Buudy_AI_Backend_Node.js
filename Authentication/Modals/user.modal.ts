import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      unique: true,
      sparse: true,
    },

    password: String,

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

export default mongoose.model("User", userSchema);
