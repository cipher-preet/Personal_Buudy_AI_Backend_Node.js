import mongoose from "mongoose";

const teamInvitationSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    inviterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inviteeEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    spaceIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Space", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "revoked"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

teamInvitationSchema.index({ inviterUserId: 1, inviteeEmail: 1, status: 1 });

export const TeamInvitation = mongoose.model("TeamInvitation", teamInvitationSchema);
