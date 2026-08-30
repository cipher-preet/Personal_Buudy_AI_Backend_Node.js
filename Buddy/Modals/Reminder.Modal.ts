import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    dateKey: {
      type: String,
      required: true,
    },
    dateLabel: {
      type: String,
      required: true,
      trim: true,
    },
    timeLabel: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ["manual", "ai"],
      default: "manual",
    },
    tone: {
      type: String,
      enum: ["rose", "lavender", "ochre", "teal"],
      default: "lavender",
    },
    repeat: {
      type: String,
      enum: ["once", "daily", "weekly", "weekdays", "monthly"],
      default: "once",
    },
    aiCalling: {
      type: Boolean,
      default: false,
    },
    notification: {
      type: Boolean,
      default: true,
    },
    beeping: {
      type: Boolean,
      default: false,
    },
    lastTriggerAtUtc: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    deliveryType: {
      type: String,
      enum: ["NORMAL_NOTIFICATION", "ALARM_NOTIFICATION", "AI_CALL"],
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: [
        "SCHEDULED",
        "TRIGGERING",
        "DELIVERED",
        "RETRY_PENDING",
        "FAILED",
        "CANCELLED",
      ],
      default: "SCHEDULED",
    },
    nextTriggerAtUtc: {
      type: Date,
      default: null,
    },
    scheduledOccurrenceId: {
      type: String,
      default: null,
    },
    lastDeliveredOccurrenceKey: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    retryAtUtc: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "reminders",
  },
);

reminderSchema.index({ userId: 1, _id: -1 });
reminderSchema.index({ userId: 1, dateKey: 1, _id: -1 });
reminderSchema.index({ userId: 1, source: 1, _id: -1 });
reminderSchema.index({ deliveryStatus: 1, nextTriggerAtUtc: 1 });
reminderSchema.index({ nextTriggerAtUtc: 1 });
reminderSchema.index({ scheduledOccurrenceId: 1 }, { sparse: true });

const Reminder =
  mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);

export { Reminder };
