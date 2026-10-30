import mongoose from "mongoose";

const spaceShareSchema = new mongoose.Schema(
  {
    spaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Space", required: true, index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    memberUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    memberEmail: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["viewer"], default: "viewer" },
    status: { type: String, enum: ["active"], default: "active" },
  },
  { timestamps: true },
);

spaceShareSchema.index({ spaceId: 1, memberUserId: 1 }, { unique: true });

export const SpaceShare = mongoose.model("SpaceShare", spaceShareSchema);
