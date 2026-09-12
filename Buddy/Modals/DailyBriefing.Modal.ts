import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
  {
    sourceType: { type: String, default: "" },
    sourceId: { type: String, default: "" },
    timestamp: { type: Date, default: null },
  },
  { _id: false },
);

const briefingItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "" },
    detail: { type: String, default: "" },
    evidence: { type: [evidenceSchema], default: [] },
  },
  { _id: false },
);

const taskCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "" },
    meta: { type: String, default: "" },
  },
  { _id: false },
);

const meetingCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    time: { type: String, default: "" },
    title: { type: String, default: "" },
    meta: { type: String, default: "" },
  },
  { _id: false },
);

const insightCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, default: "" },
    sourceType: { type: String, default: "" },
    title: { type: String, default: "" },
    body: { type: String, default: "" },
    excerpt: { type: String, default: "" },
    whyItMatters: { type: String, default: "" },
    capturedAt: { type: String, default: "" },
    space: { type: String, default: "" },
    tags: { type: [String], default: [] },
  },
  { _id: false },
);

const dailyBriefingSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
    },
    periodStartUtc: Date,
    periodEndUtc: Date,
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "READY", "FAILED", "SKIPPED"],
      default: "PENDING",
    },
    headline: { type: String, default: "" },
    overview: { type: String, default: "" },
    highlights: { type: [briefingItemSchema], default: [] },
    importantMoments: { type: [briefingItemSchema], default: [] },
    completed: { type: [briefingItemSchema], default: [] },
    pendingTasks: { type: [briefingItemSchema], default: [] },
    decisions: { type: [briefingItemSchema], default: [] },
    followUps: { type: [briefingItemSchema], default: [] },
    tomorrowFocus: { type: [briefingItemSchema], default: [] },
    insights: { type: [insightCardSchema], default: [] },
    people: { type: [String], default: [] },
    topics: { type: [String], default: [] },
    tasks: { type: [taskCardSchema], default: [] },
    meetings: { type: [meetingCardSchema], default: [] },
    missedCandidates: { type: [briefingItemSchema], default: [] },
    sourceStats: { type: mongoose.Schema.Types.Mixed, default: {} },
    pipelineVersion: { type: String, default: "daily-briefing-v1" },
    skipReason: { type: String, default: null },
    error: { type: String, default: null },
    claimedBy: { type: String, default: null },
    claimedAt: Date,
    generatedAt: Date,
  },
  {
    timestamps: true,
    collection: "daily_briefings",
  },
);

dailyBriefingSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
dailyBriefingSchema.index({ userId: 1, status: 1, dateKey: -1 });

const DailyBriefing =
  mongoose.models.DailyBriefing ||
  mongoose.model("DailyBriefing", dailyBriefingSchema);

export { DailyBriefing };
