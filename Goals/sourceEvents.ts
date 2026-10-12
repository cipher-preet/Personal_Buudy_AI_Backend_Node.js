import mongoose from "mongoose";

import { Goal, GoalSpaceLink } from "./Modals/goal.modal.js";
import { enqueueGoalWork } from "./outbox.js";

const asObjectId = (value: string) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const linkedActiveGoals = async (userId: string, spaceId: unknown) => {
  if (!spaceId) return [];
  const userObjectId = asObjectId(userId);
  if (!userObjectId) return [];
  const links = await GoalSpaceLink.find({ spaceId }).select({ goalId: 1 }).lean();
  if (links.length === 0) return [];
  return Goal.find({
    _id: { $in: links.map((link) => link.goalId) },
    ownerId: userObjectId,
    status: "ACTIVE",
  });
};

export const recordSpaceItemForGoals = async (
  userId: string,
  input: {
    spaceId?: string;
    sourceType: "task" | "note";
    sourceId: string;
    title: string;
    status?: string;
  },
) => {
  if (!asObjectId(input.sourceId) || !asObjectId(userId)) return;
  let spaceId: unknown = input.spaceId && asObjectId(input.spaceId) ? input.spaceId : null;
  if (!spaceId && input.sourceType === "task") {
    const taskObjectId = asObjectId(input.sourceId);
    const userObjectId = asObjectId(userId);
    if (!taskObjectId || !userObjectId) return;
    const task =
      (await mongoose.connection.collection("tasks").findOne({ _id: taskObjectId, userId: userObjectId })) ||
      (await mongoose.connection.collection("stagedTasks").findOne({ _id: taskObjectId, userId: userObjectId }));
    spaceId = task?.spaceId;
  }
  if (!spaceId && input.sourceType === "note") {
    const noteObjectId = asObjectId(input.sourceId);
    const userObjectId = asObjectId(userId);
    if (!noteObjectId || !userObjectId) return;
    const note =
      (await mongoose.connection.collection("notes").findOne({ _id: noteObjectId, userId: userObjectId })) ||
      (await mongoose.connection.collection("stagedNotes").findOne({ _id: noteObjectId, userId: userObjectId }));
    spaceId = note?.spaceId;
  }
  const goals = await linkedActiveGoals(userId, spaceId);
  if (goals.length === 0) return;
  const revision = new Date().toISOString();
  for (const goal of goals) {
    await enqueueGoalWork({
      goalId: goal._id,
      ownerId: goal.ownerId,
      userId,
      jobType: "evidence",
      payload: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceRevision: revision,
        title: String(input.title || (input.sourceType === "note" ? "Note" : "Task")),
        status: input.status || "",
        spaceId: String(spaceId),
      },
    });
  }
};

export const recordTaskStatusForGoals = async (userId: string, taskId: string, done: boolean) => {
  if (!mongoose.Types.ObjectId.isValid(taskId) || !mongoose.Types.ObjectId.isValid(userId)) return;
  const taskObjectId = new mongoose.Types.ObjectId(taskId);
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const task =
    (await mongoose.connection.collection("tasks").findOne({ _id: taskObjectId, userId: userObjectId })) ||
    (await mongoose.connection.collection("stagedTasks").findOne({ _id: taskObjectId, userId: userObjectId }));
  await recordSpaceItemForGoals(userId, {
    spaceId: task?.spaceId ? String(task.spaceId) : undefined,
    sourceType: "task",
    sourceId: taskId,
    title: String(task?.title || "Task"),
    status: done ? "completed" : "reopened",
  });
};

export const recordNoteForGoals = async (userId: string, noteId: string, title?: string, spaceId?: string) => {
  await recordSpaceItemForGoals(userId, {
    spaceId,
    sourceType: "note",
    sourceId: noteId,
    title: title || "Note",
    status: "updated",
  });
};
