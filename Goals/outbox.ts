import { Goal, GoalJob, GoalOutbox } from "./Modals/goal.modal.js";
import { rebuildGoalDashboard } from "./dashboard.js";
import { publishGoalJob } from "./queue.js";

const backoffMs = (attempts: number) => Math.min(15 * 60 * 1000, 2000 * 2 ** attempts);

export const enqueueGoalWork = async (input: {
  goalId: import("mongoose").Types.ObjectId;
  ownerId: import("mongoose").Types.ObjectId;
  userId: string;
  jobType: "clarify" | "baseline" | "plan" | "evidence" | "review" | "research";
  payload?: Record<string, unknown>;
}) => {
  const active = await GoalJob.findOne({
    goalId: input.goalId,
    jobType: input.jobType,
    status: { $in: ["queued", "running"] },
  });
  if (active && input.jobType !== "evidence") {
    return active;
  }
  const job = await GoalJob.create({
    goalId: input.goalId,
    ownerId: input.ownerId,
    jobType: input.jobType,
    status: "queued",
    payload: input.payload || {},
  });
  const outbox = await GoalOutbox.create({
    goalId: input.goalId,
    ownerId: input.ownerId,
    jobId: job._id,
    jobType: input.jobType,
    status: "pending",
    payload: input.payload || {},
    nextAttemptAt: new Date(),
  });
  await publishOutbox(outbox._id);
  return GoalJob.findById(job._id);
};

const publishOutbox = async (outboxId: unknown) => {
  const row = await GoalOutbox.findById(outboxId);
  if (!row || row.status === "published") return;
  try {
    await publishGoalJob({
      jobId: String(row.jobId),
      jobType: row.jobType as "clarify" | "baseline" | "plan" | "evidence" | "review" | "research",
      goalId: String(row.goalId),
      userId: String(row.ownerId),
      payload: (row.payload || {}) as Record<string, unknown>,
    });
    row.status = "published";
    row.lastError = "";
    await row.save();
  } catch (error) {
    row.attempts += 1;
    row.lastError = error instanceof Error ? error.message : "Unable to publish the goal job.";
    row.nextAttemptAt = new Date(Date.now() + backoffMs(row.attempts));
    await row.save();
    if (row.attempts >= 8) {
      await GoalJob.findByIdAndUpdate(row.jobId, {
        status: "failed",
        error: row.lastError,
      });
    }
  }
};

export const flushGoalOutbox = async () => {
  const due = await GoalOutbox.find({
    status: "pending",
    attempts: { $lt: 8 },
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(20);
  for (const row of due) {
    await publishOutbox(row._id);
  }
};

export const refreshDirtyGoalDashboards = async () => {
  const dirty = await Goal.find({
    status: { $in: ["ACTIVE", "PAUSED"] },
    $expr: { $gt: ["$evidenceVersion", "$evaluatedEvidenceVersion"] },
  })
    .select({ _id: 1 })
    .limit(20);
  for (const goal of dirty) {
    await rebuildGoalDashboard(goal._id);
  }
};

export const startGoalOutboxPublisher = () => {
  const timer = setInterval(() => {
    void flushGoalOutbox().catch((error: unknown) => {
      console.log(
        JSON.stringify({
          event: "goal_outbox_flush_failed",
          message: error instanceof Error ? error.message : "flush failed",
        }),
      );
    });
    void refreshDirtyGoalDashboards().catch((error: unknown) => {
      console.log(
        JSON.stringify({
          event: "goal_dashboard_refresh_failed",
          message: error instanceof Error ? error.message : "refresh failed",
        }),
      );
    });
  }, 10_000);
  timer.unref();
};
