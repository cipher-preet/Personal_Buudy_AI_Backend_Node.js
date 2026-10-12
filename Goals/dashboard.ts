import mongoose from "mongoose";

import {
  Goal,
  GoalDashboard,
  GoalEvidence,
  GoalPlanVersion,
  GoalRecommendation,
  GoalReview,
  GoalSnapshot,
  GoalSpaceLink,
} from "./Modals/goal.modal.js";
import { COUNTED, healthFor, milestoneStates, numericProgress, type EvidenceInput, type MilestoneInput } from "./progress.js";

const dayKey = (date = new Date(), timeZone = "Asia/Kolkata") =>
  date.toLocaleDateString("en-CA", { timeZone: timeZone || "Asia/Kolkata" });

const previousDayKey = (today: string) => {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
};

const DONE_STATUSES = new Set(["done", "completed", "complete", "closed"]);

const isDoneStatus = (value: unknown) => DONE_STATUSES.has(String(value || "").trim().toLowerCase());

const blendActual = (
  planRatio: number | null,
  spaceTasks: Array<{ status?: string; operation?: string }>,
  noteCount: number,
  transcriptCount = 0,
) => {
  const spaceTotal = spaceTasks.length;
  const spaceDone = spaceTasks.filter((item) => isDoneStatus(item.status || item.operation)).length;
  const spacePct = spaceTotal ? (spaceDone / spaceTotal) * 100 : null;
  const material = Math.min(noteCount + transcriptCount, 8);
  const materialPct = material ? (material / 8) * 100 : 0;
  const weights: number[] = [];
  const values: number[] = [];
  if (planRatio != null) {
    weights.push(0.5);
    values.push(planRatio);
  }
  if (spacePct != null) {
    weights.push(0.35);
    values.push(spacePct);
  }
  if (material) {
    weights.push(0.15);
    values.push(materialPct);
  }
  if (!values.length) return 0;
  if (planRatio == null && spacePct == null) {
    return Math.min(15, Math.round(materialPct * 0.2));
  }
  const score =
    values.reduce((sum, value, index) => sum + value * weights[index], 0) / weights.reduce((left, right) => left + right, 0);
  return Math.round(Math.min(100, Math.max(0, score)));
};

const loadLinkedSpaceStats = async (goalId: unknown, ownerId: unknown) => {
  const links = await GoalSpaceLink.find({ goalId }).select({ spaceId: 1 }).lean();
  const spaceIds = links.map((link) => link.spaceId).filter(Boolean);
  if (!spaceIds.length) {
    return { linked: false, tasks: [] as Array<{ status?: string; operation?: string }>, notes: 0 };
  }
  const filter = {
    userId: ownerId,
    spaceId: { $in: spaceIds },
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };
  const [tasks, notes] = await Promise.all([
    mongoose.connection
      .collection("tasks")
      .find(filter, { projection: { status: 1, operation: 1 } })
      .sort({ updatedAt: -1 })
      .limit(40)
      .toArray(),
    mongoose.connection.collection("notes").countDocuments(filter),
  ]);
  return {
    linked: true,
    tasks: tasks.map((row) => ({
      status: String(row.status || ""),
      operation: String(row.operation || ""),
    })),
    notes,
  };
};

const rankActions = (
  states: ReturnType<typeof milestoneStates>,
  reactions: Map<string, string>,
) => {
  const dismissed = new Set(["not_relevant", "already_done", "snooze", "blocked"]);
  const open = states.filter((item) => item.status !== "DONE" && !dismissed.has(reactions.get(item.title) || ""));
  const blockedTitles = new Set(states.filter((item) => item.status !== "DONE").map((item) => item.title));
  const eligible = open.filter((item) => item.dependencies.every((dep) => !blockedTitles.has(dep) || dep === item.title));
  const ordered = [...eligible].sort((left, right) => {
    const leftBlocked = left.status === "BLOCKED" ? 0 : 1;
    const rightBlocked = right.status === "BLOCKED" ? 0 : 1;
    return leftBlocked - rightBlocked;
  });
  return ordered.slice(0, 3).map((item) => ({
    title: item.status === "BLOCKED" ? `Unblock ${item.title}` : item.title,
    reason:
      item.status === "BLOCKED"
        ? `${item.title} is blocked, so later work should wait.`
        : `${item.title} is the next open milestone on the approved plan.`,
    priority: item.status === "BLOCKED" ? "HIGH" : "MEDIUM",
    milestoneTitle: item.title,
    evidenceIds: item.evidenceIds,
    suggestedDurationMinutes: 60,
  }));
};

export const rebuildGoalDashboard = async (goalId: unknown) => {
  const goal = await Goal.findById(goalId);
  if (!goal) return null;
  const plan = (goal.approvedPlan || goal.proposedPlan || {}) as {
    milestones?: MilestoneInput[];
    summary?: string;
    measurementType?: string;
    mission?: string;
    recommendation?: string;
    successDefinition?: { deadlineLabel?: string; metrics?: Array<{ label: string; target: string }> };
    phases?: Array<{ id?: string; title: string; windowLabel?: string; outcome?: string }>;
    days?: Array<{
      dayIndex?: number;
      dateLabel?: string;
      title: string;
      focus?: string;
      hours?: number | null;
      definitionOfDone?: string;
      tasks?: Array<{
        id: string;
        text: string;
        done?: boolean;
        note?: string;
        why?: string;
        definitionOfDone?: string;
      }>;
    }>;
    strategies?: Array<{
      id?: string;
      title: string;
      body: string;
      measurableGoal?: string;
      why?: string;
      proofPoints?: string[];
      effort?: string;
      tags?: string[];
    }>;
    priorityRecommendations?: Array<{
      id?: string;
      title: string;
      reason: string;
      priority?: string;
      howSteps?: string[];
      measurableGoal?: string;
      milestoneTitle?: string;
      suggestedDurationMinutes?: number | null;
      relatedStrategyId?: string;
    }>;
    positioningHeadline?: string;
    positioningBody?: string;
    immediateNextStep?: string;
    funnelTargets?: string[];
    checklists?: Array<{ id?: string; title: string; items?: Array<{ id: string; text: string; done?: boolean }> }>;
    scorecard?: Array<{ area: string; criteria: string }>;
    assumptions?: string[];
    sources?: Array<{ url?: string; title?: string; publisher?: string }>;
    validationReport?: unknown;
    provisional?: boolean;
  };
  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
  const days = Array.isArray(plan.days) ? plan.days : [];
  const strategies = Array.isArray(plan.strategies) ? plan.strategies : [];
  const planRecommendations = Array.isArray(plan.priorityRecommendations) ? plan.priorityRecommendations : [];
  const checklists = Array.isArray(plan.checklists) ? plan.checklists : [];
  const dayTasks = days.flatMap((day) => day.tasks || []);
  const dayTasksDone = dayTasks.filter((task) => Boolean(task.done)).length;
  const checklistItems = checklists.flatMap((list) => list.items || []);
  const checklistDone = checklistItems.filter((item) => Boolean(item.done)).length;
  const evidence = (await GoalEvidence.find({ goalId: goal._id }).sort({ createdAt: -1 }).limit(80).lean()) as EvidenceInput[];
  const states = milestoneStates(milestones, evidence);
  const doneCount = states.filter((item) => item.status === "DONE").length;
  const measurement = goal.measurementType || plan.measurementType || "MILESTONE";
  const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const numeric =
    measurement === "NUMERIC"
      ? numericProgress(
          asNumber(goal.currentValue),
          asNumber(goal.baselineValue),
          asNumber(goal.targetValue),
          goal.measurementDirection || "INCREASE",
        )
      : null;
  const executionRatio = dayTasks.length + checklistItems.length
    ? Math.round(((dayTasksDone + checklistDone) / (dayTasks.length + checklistItems.length)) * 100)
    : null;
  const outcomeConfirmed = evidence.some(
    (item) => item.category === "OUTCOME" && COUNTED.has(item.verification || ""),
  );
  const outcomeProgress = measurement === "NUMERIC" ? numeric : outcomeConfirmed ? 100 : null;
  const outcomeLabel = outcomeConfirmed
    ? "Real-world outcome confirmed"
    : measurement === "NUMERIC"
      ? goal.currentValue == null
        ? "Not verified"
        : `${goal.currentValue} confirmed`
      : "Outcome not yet confirmed";
  const healthStatus = healthFor({
    outcomeProgress: measurement === "NUMERIC" ? numeric : outcomeProgress,
    blocked: states.some((item) => item.status === "BLOCKED"),
    doneCount,
    total: states.length,
    outcomeConfirmed,
  });
  goal.healthStatus = healthStatus;
  goal.evaluatedEvidenceVersion = goal.evidenceVersion || 0;
  await goal.save();

  const existingRecs = await GoalRecommendation.find({ goalId: goal._id }).lean();
  const reactions = new Map(existingRecs.map((item) => [item.milestoneTitle, item.reaction || ""]));
  const ranked = rankActions(states, reactions);
  await GoalRecommendation.deleteMany({
    goalId: goal._id,
    reaction: "",
    milestoneTitle: { $nin: ranked.map((item) => item.milestoneTitle) },
  });
  for (const item of ranked) {
    await GoalRecommendation.findOneAndUpdate(
      { goalId: goal._id, milestoneTitle: item.milestoneTitle, reaction: "" },
      { $setOnInsert: { ownerId: goal.ownerId }, $set: item },
      { upsert: true, new: true },
    );
  }
  const dbRecommendations = await GoalRecommendation.find({ goalId: goal._id, reaction: { $in: ["", null] } })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();
  const recommendations =
    planRecommendations.length > 0
      ? planRecommendations.map((item, index) => ({
          id: String(item.id || `plan-rec-${index}`),
          title: item.title,
          reason: item.reason,
          priority: item.priority || "HIGH",
          milestoneTitle: item.milestoneTitle || "",
          suggestedDurationMinutes: item.suggestedDurationMinutes || 0,
          howSteps: Array.isArray(item.howSteps) ? item.howSteps : [],
          measurableGoal: item.measurableGoal || "",
          relatedStrategyId: item.relatedStrategyId || "",
          source: "plan",
        }))
      : dbRecommendations.map((item) => ({
          id: String(item._id),
          title: item.title,
          reason: item.reason,
          priority: item.priority,
          milestoneTitle: item.milestoneTitle,
          suggestedDurationMinutes: item.suggestedDurationMinutes,
          howSteps: [] as string[],
          measurableGoal: "",
          relatedStrategyId: "",
          source: "runtime",
        }));

  const spaceStats = await loadLinkedSpaceStats(goal._id, goal.ownerId);
  const actual = spaceStats.linked
    ? blendActual(executionRatio, spaceStats.tasks, spaceStats.notes)
    : blendActual(executionRatio, [], evidence.filter((item) => item.sourceType === "note").length, evidence.filter((item) => item.sourceType === "transcript").length);
  const zone = goal.timezone || "Asia/Kolkata";
  const todayKey = dayKey(new Date(), zone);
  await GoalSnapshot.findOneAndUpdate(
    { goalId: goal._id, periodType: "daily", periodKey: todayKey },
    { $set: { target: 100, actual } },
    { upsert: true },
  );
  const priorSnapshot = await GoalSnapshot.findOne({
    goalId: goal._id,
    periodType: "daily",
    periodKey: { $ne: todayKey },
  }).lean();
  const yesterdayKey = previousDayKey(todayKey);
  if (!priorSnapshot && yesterdayKey !== todayKey) {
    await GoalSnapshot.findOneAndUpdate(
      { goalId: goal._id, periodType: "daily", periodKey: yesterdayKey },
      { $setOnInsert: { target: 100, actual: 0 } },
      { upsert: true },
    );
  }
  const snapshots = await GoalSnapshot.find({ goalId: goal._id, periodType: "daily" })
    .sort({ periodKey: 1 })
    .limit(14)
    .lean();
  const review = await GoalReview.findOne({ goalId: goal._id }).sort({ createdAt: -1 }).lean();
  const proposed = await GoalPlanVersion.findOne({
    goalId: goal._id,
    status: "proposed",
    version: { $gt: goal.activePlanVersion || 0 },
  })
    .sort({ version: -1 })
    .lean();

  const payload = {
    goalId: String(goal._id),
    title: goal.title,
    status: goal.status,
    healthStatus,
    statement: goal.statement,
    timeframe: goal.timeframe || "",
    deadlineLabel: plan.successDefinition?.deadlineLabel || goal.timeframe || "",
    successCriteria: goal.successCriteria || "",
    outcomeLabel,
    outcomeProgress,
    workCompleted: doneCount,
    workTotal: states.length,
    taskProgress: {
      completed: dayTasksDone,
      total: dayTasks.length,
      checklistCompleted: checklistDone,
      checklistTotal: checklistItems.length,
    },
    chart: {
      points: snapshots.map((point) => ({
        label: point.periodKey,
        target: point.target,
        actual: point.actual,
      })),
    },
    milestones: states,
    mission: plan.mission || "",
    recommendation: plan.recommendation || plan.summary || "",
    positioningHeadline: plan.positioningHeadline || "",
    positioningBody: plan.positioningBody || "",
    immediateNextStep: plan.immediateNextStep || "",
    funnelTargets: Array.isArray(plan.funnelTargets) ? plan.funnelTargets : [],
    successDefinition: plan.successDefinition || { deadlineLabel: goal.timeframe || "", metrics: [] },
    phases: Array.isArray(plan.phases) ? plan.phases : [],
    days,
    strategies,
    checklists,
    scorecard: Array.isArray(plan.scorecard) ? plan.scorecard : [],
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions : [],
    recommendations,
    evidence: evidence.slice(0, 8).map((item) => ({
      id: String(item._id || ""),
      text: item.text || "",
      category: item.category || "",
      verification: item.verification || "",
      sourceType: (item as { sourceType?: string }).sourceType || "",
    })),
    latestReview: review
      ? { summary: review.summary, periodType: review.periodType, focus: review.focus || "" }
      : null,
    proposedRevision: proposed
      ? {
          version: proposed.version,
          summary:
            proposed.plan && typeof proposed.plan === "object" && "summary" in proposed.plan
              ? String((proposed.plan as { summary?: unknown }).summary || "")
              : "",
        }
      : null,
    planSummary: plan.summary || "",
    understanding: (goal as { understanding?: unknown }).understanding || null,
    contextProfile: (goal as { contextProfile?: unknown }).contextProfile || null,
    pipelineState: (goal as { pipelineState?: string }).pipelineState || "",
    researchSummary: (goal as { researchSummary?: unknown }).researchSummary || null,
    gaps: (goal as { gaps?: unknown }).gaps || null,
    validationReport: (goal as { validationReport?: unknown }).validationReport || plan.validationReport || null,
    sources: Array.isArray((plan as { sources?: unknown }).sources) ? (plan as { sources: unknown[] }).sources : [],
    progress: {
      execution: {
        completed: dayTasksDone + checklistDone,
        total: dayTasks.length + checklistItems.length,
        ratio: actual,
      },
      readiness: {
        milestonesDone: doneCount,
        milestonesTotal: states.length,
      },
      achievement: {
        achieved: outcomeConfirmed,
        label: outcomeLabel,
      },
    },
    provisional: Boolean((plan as { provisional?: boolean }).provisional),
  };

  await GoalDashboard.findOneAndUpdate(
    { goalId: goal._id },
    { $set: { ownerId: goal.ownerId, evidenceVersion: goal.evidenceVersion || 0, payload } },
    { upsert: true },
  );
  return payload;
};

export const readGoalDashboard = async (goalId: unknown) => {
  const goal = await Goal.findById(goalId).select({ evidenceVersion: 1 }).lean();
  if (!goal) return null;
  const cached = await GoalDashboard.findOne({ goalId: goal._id }).lean();
  const points = (cached?.payload as { chart?: { points?: Array<{ actual?: number | null }> } } | undefined)?.chart
    ?.points;
  const chartNeedsRebuild = !Array.isArray(points) || points.length < 2 || points.every((point) => point.actual == null);
  if (cached && cached.evidenceVersion === (goal.evidenceVersion || 0) && cached.payload && !chartNeedsRebuild) {
    return cached.payload;
  }
  return rebuildGoalDashboard(goalId);
};
