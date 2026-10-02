import mongoose from "mongoose";

const calendarIntegrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      enum: ["google"],
      required: true,
    },
    accountEmail: {
      type: String,
      default: "",
      trim: true,
    },
    /** Encrypted with utils/secretBox — never returned to clients. */
    refreshToken: {
      type: String,
      required: true,
      select: false,
    },
    scope: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "error"],
      default: "active",
    },
    lastError: {
      type: String,
      default: "",
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    lastSyncEventCount: {
      type: Number,
      default: 0,
    },
    calendarCount: {
      type: Number,
      default: 0,
    },
    syncInProgressSince: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "calendar_integrations",
  },
);

calendarIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });
calendarIntegrationSchema.index({ provider: 1, status: 1, lastSyncedAt: 1 });

const CalendarIntegration =
  mongoose.models.CalendarIntegration ||
  mongoose.model("CalendarIntegration", calendarIntegrationSchema);

export { CalendarIntegration };
