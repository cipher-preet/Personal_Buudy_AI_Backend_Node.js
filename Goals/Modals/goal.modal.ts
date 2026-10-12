import mongoose from "mongoose";

const GOAL_STATUSES = [
  "DRAFT",
  "CLARIFYING",
  "AWAITING_SPACE",
  "CONTEXT_ANALYSIS",
  "PLAN_REVIEW",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
] as const;

const goalSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    statement: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: GOAL_STATUSES, default: "DRAFT", index: true },
    goalType: { type: String, default: "", maxlength: 40 },
    description: { type: String, default: "", maxlength: 2000 },
    category: { type: String, default: "", maxlength: 120 },
    audience: { type: String, default: "", maxlength: 240 },
    targetMetric: { type: String, default: "", maxlength: 240 },
    timeframe: { type: String, default: "", maxlength: 120 },
    successCriteria: { type: String, default: "", maxlength: 1000 },
    availableHoursPerWeek: { type: Number, default: null },
    constraints: { type: [String], default: [] },
    missingMaterial: { type: [String], default: [] },
    measurementType: { type: String, default: "", maxlength: 40 },
    completeness: { type: Number, default: 5, min: 0, max: 100 },
    timezone: { type: String, default: "Asia/Kolkata", maxlength: 80 },
    healthStatus: { type: String, default: "INSUFFICIENT_DATA", maxlength: 40 },
    evidenceVersion: { type: Number, default: 0 },
    evaluatedEvidenceVersion: { type: Number, default: 0 },
    baselineValue: { type: Number, default: null },
    targetValue: { type: Number, default: null },
    currentValue: { type: Number, default: null },
    measurementDirection: { type: String, enum: ["", "INCREASE", "DECREASE"], default: "" },
    latestStep: { type: mongoose.Schema.Types.Mixed, default: null },
    proposedPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    approvedPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    activePlanVersion: { type: Number, default: 0 },
    understanding: { type: mongoose.Schema.Types.Mixed, default: null },
    contextProfile: { type: mongoose.Schema.Types.Mixed, default: null },
    pipelineState: { type: String, default: "INTAKE", maxlength: 40 },
    researchSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    gaps: { type: mongoose.Schema.Types.Mixed, default: null },
    validationReport: { type: mongoose.Schema.Types.Mixed, default: null },
    progress: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: "goals" },
);

goalSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });

const goalMessageSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      required: true,
      index: true,
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true, maxlength: 4000 },
    stepId: { type: String, default: "" },
    control: { type: String, default: "" },
  },
  { timestamps: true, collection: "goal_messages" },
);

const goalJobSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      required: true,
      index: true,
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobType: {
      type: String,
      enum: ["clarify", "baseline", "plan", "evidence", "review", "research"],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["queued", "running", "ready", "failed"],
      default: "queued",
      index: true,
    },
    error: { type: String, default: "" },
    model: { type: String, default: "" },
  },
  { timestamps: true, collection: "goal_jobs" },
);

const goalSpaceLinkSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    spaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Space", required: true },
  },
  { timestamps: true, collection: "goal_space_links" },
);

goalSpaceLinkSchema.index({ goalId: 1, spaceId: 1 }, { unique: true });
goalSpaceLinkSchema.index({ spaceId: 1, goalId: 1 });

const goalOutboxSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "GoalJob", required: true },
    jobType: { type: String, required: true },
    status: { type: String, enum: ["pending", "published"], default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date(), index: true },
    lastError: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "goal_outbox" },
);
goalOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

const goalDashboardSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true, unique: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    evidenceVersion: { type: Number, default: 0 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: "goal_dashboards" },
);

const goalEvidenceSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    sourceRevision: { type: String, required: true },
    evidenceKey: { type: String, required: true },
    category: { type: String, required: true },
    verification: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    milestoneTitle: { type: String, default: "" },
  },
  { timestamps: true, collection: "goal_evidence" },
);
goalEvidenceSchema.index(
  { goalId: 1, sourceType: 1, sourceId: 1, sourceRevision: 1, evidenceKey: 1 },
  { unique: true },
);

const goalPlanVersionSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ["proposed", "approved"], default: "proposed" },
    plan: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: "goal_plan_versions" },
);
goalPlanVersionSchema.index({ goalId: 1, version: 1 }, { unique: true });

const goalRecommendationSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 180 },
    reason: { type: String, default: "", maxlength: 500 },
    priority: { type: String, default: "MEDIUM" },
    milestoneTitle: { type: String, default: "" },
    evidenceIds: { type: [String], default: [] },
    suggestedDurationMinutes: { type: Number, default: 60 },
    reaction: { type: String, default: "" },
  },
  { timestamps: true, collection: "goal_recommendations" },
);
goalRecommendationSchema.index({ goalId: 1, milestoneTitle: 1 });

const goalReviewSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    periodType: { type: String, enum: ["daily", "weekly"], required: true },
    periodKey: { type: String, required: true },
    summary: { type: String, default: "", maxlength: 2000 },
    healthStatus: { type: String, default: "INSUFFICIENT_DATA" },
    focus: { type: String, default: "" },
  },
  { timestamps: true, collection: "goal_reviews" },
);
goalReviewSchema.index({ goalId: 1, periodType: 1, periodKey: 1 }, { unique: true });

const goalCheckinSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Number, required: true },
    note: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true, collection: "goal_checkins" },
);

const goalSnapshotSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true },
    periodType: { type: String, default: "daily" },
    periodKey: { type: String, required: true },
    target: { type: Number, default: null },
    actual: { type: Number, default: null },
  },
  { timestamps: true, collection: "goal_snapshots" },
);
goalSnapshotSchema.index({ goalId: 1, periodType: 1, periodKey: 1 }, { unique: true });

const Goal = mongoose.model("Goal", goalSchema);
const GoalMessage = mongoose.model("GoalMessage", goalMessageSchema);
const GoalJob = mongoose.model("GoalJob", goalJobSchema);
const GoalSpaceLink = mongoose.model("GoalSpaceLink", goalSpaceLinkSchema);
const GoalOutbox = mongoose.model("GoalOutbox", goalOutboxSchema);
const GoalDashboard = mongoose.model("GoalDashboard", goalDashboardSchema);
const GoalEvidence = mongoose.model("GoalEvidence", goalEvidenceSchema);
const GoalPlanVersion = mongoose.model("GoalPlanVersion", goalPlanVersionSchema);
const GoalRecommendation = mongoose.model("GoalRecommendation", goalRecommendationSchema);
const GoalReview = mongoose.model("GoalReview", goalReviewSchema);
const GoalCheckin = mongoose.model("GoalCheckin", goalCheckinSchema);
const GoalSnapshot = mongoose.model("GoalSnapshot", goalSnapshotSchema);

const goalResearchSessionSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, default: "", maxlength: 80 },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    sources: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: "goal_research_sessions" },
);
goalResearchSessionSchema.index({ goalId: 1, createdAt: -1 });

const goalResearchEvidenceSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, default: "" },
    evidenceId: { type: String, default: "" },
    fact: { type: String, default: "", maxlength: 1000 },
    kind: { type: String, default: "FACT" },
    sourceTitle: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    publisher: { type: String, default: "" },
    publicationDate: { type: String, default: "" },
    retrievedAt: { type: Date, default: Date.now },
    excerpt: { type: String, default: "" },
    geographicApplicability: { type: String, default: "" },
    relevance: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    freshness: { type: String, default: "stable" },
    reviewBy: { type: Date, default: null },
  },
  { timestamps: true, collection: "goal_research_evidence" },
);
goalResearchEvidenceSchema.index({ goalId: 1, sourceUrl: 1, fact: 1 });

const GoalResearchSession = mongoose.model("GoalResearchSession", goalResearchSessionSchema);
const GoalResearchEvidence = mongoose.model("GoalResearchEvidence", goalResearchEvidenceSchema);

export {
  Goal,
  GoalCheckin,
  GoalDashboard,
  GoalEvidence,
  GoalJob,
  GoalMessage,
  GoalOutbox,
  GoalPlanVersion,
  GoalRecommendation,
  GoalResearchEvidence,
  GoalResearchSession,
  GoalReview,
  GoalSnapshot,
  GoalSpaceLink,
  GOAL_STATUSES,
};
