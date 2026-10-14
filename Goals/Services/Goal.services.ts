import mongoose from "mongoose";

import { publishGoalJob } from "../queue.js";
import { readGoalDashboard, rebuildGoalDashboard } from "../dashboard.js";
import {
  GoalCheckin,
  GoalEvidence,
  GoalPlanVersion,
  GoalRecommendation,
  GoalResearchEvidence,
  GoalResearchSession,
} from "../Modals/goal.modal.js";
import { enqueueGoalWork } from "../outbox.js";
import { goalRepository, type GoalJobType } from "../Repository/Goal.repository.js";
import { validatePlanLimit } from "../../Plans/Services/Plan.services.js";

type GoalDoc = {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
};

const clip = (value: string, max: number) => value.trim().slice(0, max);

const serializeGoal = (goal: { _id: unknown } & Record<string, unknown>) => ({
  id: String(goal._id),
  title: goal.title,
  statement: goal.statement,
  status: goal.status,
  goalType: goal.goalType || "",
  description: goal.description || "",
  category: goal.category || "",
  audience: goal.audience || "",
  targetMetric: goal.targetMetric || "",
  timeframe: goal.timeframe || "",
  successCriteria: goal.successCriteria || "",
  availableHoursPerWeek: goal.availableHoursPerWeek ?? null,
  constraints: goal.constraints || [],
  missingMaterial: goal.missingMaterial || [],
  measurementType: goal.measurementType || "",
  completeness: goal.completeness ?? 0,
  healthStatus: goal.healthStatus || "INSUFFICIENT_DATA",
  latestStep: goal.latestStep || null,
  proposedPlan: goal.proposedPlan || null,
  approvedPlan: goal.approvedPlan || null,
  activePlanVersion: goal.activePlanVersion || 0,
  understanding: goal.understanding || null,
  contextProfile: goal.contextProfile || null,
  pipelineState: goal.pipelineState || "INTAKE",
  researchSummary: goal.researchSummary || null,
  gaps: goal.gaps || null,
  validationReport: goal.validationReport || null,
  progress: goal.progress || null,
  updatedAt: goal.updatedAt,
});

const serializeJob = (job: { _id: unknown; jobType: string; status: string; error?: string } | null) =>
  job
    ? {
        id: String(job._id),
        type: job.jobType,
        status: job.status,
        error: job.error || "",
      }
    : null;

const enqueue = async (
  goal: GoalDoc,
  ownerId: string,
  jobType: GoalJobType,
  payload?: Record<string, unknown>,
) =>
  enqueueGoalWork({
    goalId: goal._id,
    ownerId: goal.ownerId,
    userId: ownerId,
    jobType,
    payload,
  });

const answerText = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ")
      .slice(0, 2000);
  }
  if (typeof value === "string") {
    return clip(value, 2000);
  }
  return "";
};

const skipAnswer = (text: string) => {
  const normalized = text.trim().toLowerCase();
  return ["skip", "not sure", "i don't know", "i dont know", "suggest for me", "suggest", "idk", "unknown", "none"].includes(
    normalized,
  );
};

const writeContext = (goal: { contextProfile?: Record<string, unknown> }, field: string, text: string) => {
  const profile = { ...(goal.contextProfile || {}) } as Record<string, unknown>;
  const unknown = Array.isArray(profile.unknownFields) ? [...(profile.unknownFields as string[])] : [];
  const answers = Array.isArray(profile.answers) ? [...(profile.answers as unknown[])] : [];
  if (skipAnswer(text)) {
    profile[field] = "UNKNOWN";
    if (!unknown.includes(field)) unknown.push(field);
    profile.unknownFields = unknown;
  } else {
    profile[field] = text.slice(0, 500);
    profile.unknownFields = unknown.filter((item) => item !== field);
    answers.push({ field, value: text.slice(0, 500) });
  }
  profile.answers = answers.slice(-24);
  goal.contextProfile = profile;
};

const applyUnderstandingAnswer = (
  goal: {
    description?: string;
    category?: string;
    audience?: string;
    targetMetric?: string;
    successCriteria?: string;
    timeframe?: string;
    availableHoursPerWeek?: number | null;
    constraints?: string[];
    completeness?: number;
    contextProfile?: Record<string, unknown>;
  },
  stepId: string,
  text: string,
) => {
  if (!text) return;
  const key = stepId.toLowerCase();
  if (key.includes("current-level") || key.includes("starting-level") || key.includes("current-role")) {
    writeContext(goal, key.includes("role") ? "currentRole" : "startingLevel", text);
    goal.completeness = Math.max(goal.completeness || 0, 25);
    return;
  }
  if (key.includes("location") || key === "geography") {
    writeContext(goal, "geography", text);
    return;
  }
  if (
    key.includes("what-") ||
    key.includes("product") ||
    key.includes("skill") ||
    key.includes("app") ||
    key.includes("freelance-scope") ||
    key.includes("offer") ||
    key.includes("habit-detail") ||
    key.includes("career-detail")
  ) {
    if (!goal.description) goal.description = text.slice(0, 2000);
    if (!goal.category) goal.category = text.slice(0, 120);
  } else if (key.includes("audience")) {
    goal.audience = text.slice(0, 240);
  } else if (key.includes("sales") || key.includes("target") || key.includes("metric")) {
    goal.targetMetric = text.slice(0, 240);
    if (!goal.successCriteria) goal.successCriteria = text.slice(0, 1000);
  } else if (key.includes("success") || key.includes("done") || key.includes("launch") || key.includes("proof")) {
    goal.successCriteria = text.slice(0, 1000);
  } else if (key.includes("requirement") || key.includes("constraint") || key.includes("scope") || key.includes("feature")) {
    const next = [...(goal.constraints || []), text.slice(0, 200)].filter(Boolean).slice(0, 8);
    goal.constraints = next;
  } else if (key.includes("timeframe") || key.includes("when")) {
    goal.timeframe = text.slice(0, 120);
  } else if (key.includes("hour")) {
    const hours = Number(text);
    if (Number.isFinite(hours)) goal.availableHoursPerWeek = hours;
  }
  goal.completeness = Math.max(goal.completeness || 0, 20);
};

export const goalServices = {
  async create(ownerId: string, statement: string) {
    const quota = await validatePlanLimit(ownerId, "goals");
    if (!quota.allowed) {
      throw Object.assign(new Error(quota.message || "Plan limit reached."), {
        status: quota.status,
        data: quota.data,
      });
    }

    const goal = await goalRepository.createGoal(ownerId, statement);
    if (!goal) {
      throw Object.assign(new Error("Invalid user."), { status: 400 });
    }
    await goalRepository.addMessage({
      goalId: goal._id,
      ownerId: goal.ownerId,
      role: "user",
      text: goal.statement,
      stepId: "statement",
      control: "text",
    });
    const job = await enqueue(goal, ownerId, "clarify");
    return { goal: serializeGoal(goal.toObject()), job: serializeJob(job) };
  },

  async list(ownerId: string) {
    const goals = await goalRepository.listOwned(ownerId);
    return goals.map((goal) => ({
      id: String(goal._id),
      title: goal.title,
      description: goal.successCriteria || goal.timeframe || goal.statement,
      status: goal.status,
      completeness: goal.completeness ?? 0,
      healthStatus: goal.healthStatus || "INSUFFICIENT_DATA",
    }));
  },

  async get(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    return serializeGoal(goal.toObject());
  },

  async remove(ownerId: string, goalId: string) {
    return goalRepository.removeOwned(goalId, ownerId);
  },

  async setup(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    const [job, spaces] = await Promise.all([
      goalRepository.latestJob(goal._id),
      goalRepository.listSpaceLinks(goal._id, ownerId),
    ]);
    return {
      goal: serializeGoal(goal.toObject()),
      job: serializeJob(job),
      spaces,
    };
  },

  async answer(ownerId: string, goalId: string, stepId: string, value: unknown) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    const text = answerText(value);
    if (!text && goal.latestStep && (goal.latestStep as { control?: string }).control !== "space_picker") {
      throw Object.assign(new Error("Add an answer before continuing."), { status: 400 });
    }
    const resolvedStepId = stepId || String((goal.latestStep as { stepId?: string } | null)?.stepId || "");
    const control = String((goal.latestStep as { control?: string } | null)?.control || "");
    if (control !== "confirm_baseline" && control !== "plan_review" && control !== "space_picker") {
      applyUnderstandingAnswer(goal, resolvedStepId, text);
      goal.status = "CLARIFYING";
      goal.markModified("contextProfile");
      await goal.save();
    }
    await goalRepository.addMessage({
      goalId: goal._id,
      ownerId: goal.ownerId,
      role: "user",
      text: text || "Continue",
      stepId: resolvedStepId,
      control,
    });
    const jobType: GoalJobType = control === "confirm_baseline" ? "plan" : "clarify";
    const job = await enqueue(goal, ownerId, jobType);
    return { goalId: String(goal._id), job: serializeJob(job) };
  },

  async setSpaces(ownerId: string, goalId: string, spaceIds: string[]) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    const unique = [...new Set(spaceIds.map((id) => id.trim()).filter(Boolean))].slice(0, 8);
    const owned = unique.length ? await goalRepository.ownedSpaces(ownerId, unique) : [];
    if (owned.length !== unique.length) {
      throw Object.assign(new Error("One or more Spaces are not available."), { status: 403 });
    }
    await goalRepository.replaceSpaces(
      goal._id,
      goal.ownerId,
      owned.map((space) => space._id),
    );
    goal.status = "CONTEXT_ANALYSIS";
    goal.completeness = Math.max(goal.completeness || 0, 70);
    await goal.save();
    const job = await enqueue(goal, ownerId, "baseline");
    return {
      goal: serializeGoal(goal.toObject()),
      job: serializeJob(job),
      spaces: owned.map((space) => ({ id: String(space._id), name: space.spacename || "Space" })),
    };
  },

  async activate(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    if (!goal.proposedPlan) {
      throw Object.assign(new Error("Approve a roadmap after it is ready."), { status: 400 });
    }
    goal.approvedPlan = goal.proposedPlan;
    goal.activePlanVersion = 1;
    goal.status = "ACTIVE";
    goal.healthStatus = "INSUFFICIENT_DATA";
    goal.completeness = 100;
    await GoalPlanVersion.findOneAndUpdate(
      { goalId: goal._id, version: 1 },
      {
        $set: { ownerId: goal.ownerId, status: "approved", plan: goal.proposedPlan },
      },
      { upsert: true },
    );
    await goal.save();
    const periodKey = new Date().toLocaleDateString("en-CA", {
      timeZone: goal.timezone || "Asia/Kolkata",
    });
    await enqueue(goal, ownerId, "review", { periodType: "daily", periodKey }).catch(() => undefined);
    await rebuildGoalDashboard(goal._id);
    return serializeGoal(goal.toObject());
  },

  async retry(ownerId: string, goalId: string, jobId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    const job = await goalRepository.findJob(jobId, goal._id);
    if (!job) {
      return null;
    }
    if (job.status === "running" || job.status === "queued") {
      return serializeJob(job);
    }
    job.status = "queued";
    job.error = "";
    await job.save();
    try {
      await publishGoalJob({
        jobId: String(job._id),
        jobType: job.jobType,
        goalId: String(goal._id),
        userId: ownerId,
      });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unable to queue the goal step.";
      await job.save();
    }
    return serializeJob(job);
  },

  async dashboard(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    return readGoalDashboard(goal._id);
  },

  async checkin(ownerId: string, goalId: string, value: number, note: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    if (goal.status !== "ACTIVE" && goal.status !== "PAUSED") {
      throw Object.assign(new Error("Check in after the plan is approved."), { status: 400 });
    }
    const checkin = await GoalCheckin.create({
      goalId: goal._id,
      ownerId: goal.ownerId,
      value,
      note: note.slice(0, 500),
    });
    await GoalEvidence.create({
      goalId: goal._id,
      ownerId: goal.ownerId,
      sourceType: "checkin",
      sourceId: String(checkin._id),
      sourceRevision: "1",
      evidenceKey: "outcome",
      category: "OUTCOME",
      verification: "USER_CONFIRMED",
      text: note || `Confirmed value ${value}`,
      milestoneTitle: "",
    });
    goal.currentValue = value;
    if (!goal.measurementType) goal.measurementType = "NUMERIC";
    if (!goal.measurementDirection) goal.measurementDirection = "INCREASE";
    goal.evidenceVersion = (goal.evidenceVersion || 0) + 1;
    await goal.save();
    return rebuildGoalDashboard(goal._id);
  },

  async feedback(ownerId: string, goalId: string, recommendationId: string, reaction: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    const allowed = new Set(["helpful", "not_relevant", "already_done", "blocked", "snooze"]);
    if (!allowed.has(reaction)) {
      throw Object.assign(new Error("Choose a valid response."), { status: 400 });
    }
    const updated = await GoalRecommendation.findOneAndUpdate(
      { _id: recommendationId, goalId: goal._id, ownerId: goal.ownerId },
      { reaction },
      { new: true },
    );
    if (!updated) return null;
    return rebuildGoalDashboard(goal._id);
  },

  async pause(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    if (goal.status !== "ACTIVE" && goal.status !== "PAUSED") {
      throw Object.assign(new Error("Only an active goal can be paused."), { status: 400 });
    }
    goal.status = goal.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    await goal.save();
    return rebuildGoalDashboard(goal._id);
  },

  async approveRevision(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    const proposed = await GoalPlanVersion.findOne({
      goalId: goal._id,
      ownerId: goal.ownerId,
      status: "proposed",
      version: { $gt: goal.activePlanVersion || 0 },
    }).sort({ version: -1 });
    if (!proposed?.plan) {
      throw Object.assign(new Error("There is no proposed plan to approve."), { status: 400 });
    }
    goal.approvedPlan = proposed.plan;
    goal.proposedPlan = proposed.plan;
    goal.activePlanVersion = proposed.version;
    proposed.status = "approved";
    await proposed.save();
    await goal.save();
    return rebuildGoalDashboard(goal._id);
  },

  async togglePlanItem(
    ownerId: string,
    goalId: string,
    input: { kind: "day_task" | "checklist_item"; itemId: string; done?: boolean; note?: string },
  ) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    if (goal.status !== "ACTIVE" && goal.status !== "PAUSED" && goal.status !== "PLAN_REVIEW") {
      throw Object.assign(new Error("Approve the plan before tracking tasks."), { status: 400 });
    }
    const itemId = String(input.itemId || "").trim();
    if (!itemId) {
      throw Object.assign(new Error("itemId is required."), { status: 400 });
    }
    const hasDone = typeof input.done === "boolean";
    const hasNote = typeof input.note === "string";
    if (!hasDone && !hasNote) {
      throw Object.assign(new Error("Provide done or note to update."), { status: 400 });
    }
    const plan =
      goal.approvedPlan && typeof goal.approvedPlan === "object"
        ? structuredClone(goal.approvedPlan as Record<string, unknown>)
        : goal.proposedPlan && typeof goal.proposedPlan === "object"
          ? structuredClone(goal.proposedPlan as Record<string, unknown>)
          : null;
    if (!plan) {
      throw Object.assign(new Error("No plan is available to update."), { status: 400 });
    }

    let matched = false;
    const nextDone = hasDone ? input.done : undefined;
    const nextNote = hasNote ? String(input.note || "").trim().slice(0, 2000) : undefined;
    if (input.kind === "day_task") {
      const days = Array.isArray(plan.days) ? (plan.days as Array<Record<string, unknown>>) : [];
      for (const day of days) {
        const tasks = Array.isArray(day.tasks) ? (day.tasks as Array<Record<string, unknown>>) : [];
        for (const task of tasks) {
          if (String(task.id || "") === itemId) {
            if (nextDone !== undefined) task.done = nextDone;
            if (nextNote !== undefined) task.note = nextNote;
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      plan.days = days;
    } else {
      const checklists = Array.isArray(plan.checklists)
        ? (plan.checklists as Array<Record<string, unknown>>)
        : [];
      for (const list of checklists) {
        const items = Array.isArray(list.items) ? (list.items as Array<Record<string, unknown>>) : [];
        for (const item of items) {
          if (String(item.id || "") === itemId) {
            if (nextDone !== undefined) item.done = nextDone;
            if (nextNote !== undefined) item.note = nextNote;
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      plan.checklists = checklists;
    }
    if (!matched) {
      throw Object.assign(new Error("That checklist item was not found."), { status: 404 });
    }

    if (goal.approvedPlan) goal.approvedPlan = plan;
    if (goal.proposedPlan) goal.proposedPlan = plan;
    goal.markModified("approvedPlan");
    goal.markModified("proposedPlan");
    goal.evidenceVersion = (goal.evidenceVersion || 0) + 1;
    await goal.save();
    await GoalPlanVersion.findOneAndUpdate(
      { goalId: goal._id, version: goal.activePlanVersion || 1 },
      { $set: { plan } },
    );
    return rebuildGoalDashboard(goal._id);
  },

  async sources(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    const [session, evidence] = await Promise.all([
      GoalResearchSession.findOne({ goalId: goal._id, ownerId: goal.ownerId }).sort({ createdAt: -1 }).lean(),
      GoalResearchEvidence.find({ goalId: goal._id, ownerId: goal.ownerId }).sort({ retrievedAt: -1 }).limit(40).lean(),
    ]);
    const fromSession = Array.isArray(session?.sources) ? session.sources : [];
    return {
      goalId: String(goal._id),
      researchSummary: goal.researchSummary || session?.summary || null,
      sources: fromSession,
      evidence: evidence.map((item) => ({
        id: item.evidenceId || String(item._id),
        fact: item.fact,
        kind: item.kind,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
        publisher: item.publisher,
        publicationDate: item.publicationDate,
        confidence: item.confidence,
        freshness: item.freshness,
      })),
    };
  },

  async refreshResearch(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    goal.pipelineState = "RESEARCHING";
    await goal.save();
    const job = await enqueue(goal, ownerId, "research", { forceRefresh: true, preserveProgress: true });
    return { goal: serializeGoal(goal.toObject()), job: serializeJob(job) };
  },

  async replan(ownerId: string, goalId: string) {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) return null;
    if (!["PLAN_REVIEW", "ACTIVE", "PAUSED", "CONTEXT_ANALYSIS"].includes(String(goal.status))) {
      throw Object.assign(new Error("Replan after a draft exists."), { status: 400 });
    }
    goal.pipelineState = "NEEDS_REVISION";
    await goal.save();
    const job = await enqueue(goal, ownerId, "plan", { preserveProgress: true, forceRefresh: false });
    return { goal: serializeGoal(goal.toObject()), job: serializeJob(job) };
  },
};
