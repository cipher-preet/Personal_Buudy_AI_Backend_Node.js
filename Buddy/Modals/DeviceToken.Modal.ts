import mongoose from "mongoose";

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web"],
      default: "android",
    },
  },
  {
    timestamps: true,
    collection: "device_tokens",
  },
);

deviceTokenSchema.index({ userId: 1, updatedAt: -1 });
deviceTokenSchema.index({ token: 1 }, { unique: true });

const DeviceToken =
  mongoose.models.DeviceToken ||
  mongoose.model("DeviceToken", deviceTokenSchema);

export { DeviceToken };
