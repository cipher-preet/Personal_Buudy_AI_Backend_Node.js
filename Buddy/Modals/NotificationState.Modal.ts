import mongoose from "mongoose";

/**
 * Per-user read state for the in-app inbox. Notifications themselves are derived
 * from tasks, notes, and meeting sessions, so anything created after
 * `lastReadAllAt` is unread unless its key is in `readKeys`.
 */
const notificationStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    lastReadAllAt: { type: Date, required: true },
    readKeys: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: "notification_states",
  },
);

export const NotificationState =
  mongoose.models.NotificationState ||
  mongoose.model("NotificationState", notificationStateSchema);
