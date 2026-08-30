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
      default: true,
    },
    beeping: {
      type: Boolean,
      default: false,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "calendar_events",
  },
);

calendarEventSchema.index({ userId: 1, dateKey: 1, _id: -1 });
calendarEventSchema.index({ userId: 1, _id: -1 });

const CalendarEvent =
  mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", calendarEventSchema);

export { CalendarEvent };
