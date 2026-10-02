import mongoose from "mongoose";

const calendarEventSchema = new mongoose.Schema(
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
      default: "",
      trim: true,
      maxlength: 500,
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
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
    startTimeLabel: {
      type: String,
      required: true,
      trim: true,
    },
    endTimeLabel: {
      type: String,
      required: true,
      trim: true,
    },
    tone: {
      type: String,
      enum: ["indigo", "violet", "cyan", "teal"],
      default: "indigo",
    },
    aiReminder: {
      type: Boolean,
      default: false,
    },
    aiCalling: {
      type: Boolean,
      default: false,
    },
    notification: {
      type: Boolean,
      default: false,
    },
    beeping: {
      type: Boolean,
      default: false,
    },
    remindBeforeMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 1440,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },
    source: {
      type: String,
      enum: ["manual", "google"],
      default: "manual",
    },
    /** Provider event id; all-day events spanning days get one row per day (`<id>:<dateKey>`). */
    externalId: {
      type: String,
      default: undefined,
    },
    externalCalendarId: {
      type: String,
      default: undefined,
    },
    externalUrl: {
      type: String,
      default: "",
    },
    allDay: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "calendar_events",
  },
);

calendarEventSchema.index({ userId: 1, dateKey: 1, _id: -1 });
calendarEventSchema.index({ userId: 1, _id: -1 });
calendarEventSchema.index(
  { userId: 1, source: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: "string" } } },
);

const CalendarEvent =
  mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", calendarEventSchema);

export { CalendarEvent };
