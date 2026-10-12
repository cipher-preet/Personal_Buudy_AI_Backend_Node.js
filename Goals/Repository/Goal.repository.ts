import mongoose from "mongoose";

import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import {
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
} from "../Modals/goal.modal.js";

export type GoalJobType = "clarify" | "baseline" | "plan" | "evidence" | "review" | "research";

const toObjectId = (value: string) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(value);
};

const ownerFilter = (ownerId: string) => {
  const objectId = toObjectId(ownerId);
  return objectId ? { $in: [objectId, ownerId] } : { $in: [ownerId] };
};

export const goalRepository = {
  toObjectId,

  createGoal: (ownerId: string, statement: string) => {
    const owner = toObjectId(ownerId);
    if (!owner) {
      return null;
    }
    const cleaned = statement.trim();
    const named = cleaned.match(/(?:called|named)\s+([A-Za-z0-9][\w\s-]{1,40})/i)?.[1]?.trim();
    const stripped = cleaned
      .replace(/^(i\s+want\s+to|i'd\s+like\s+to|i\s+need\s+to|help\s+me)\s+/i, "")
      .trim();
    const title = (named || stripped || cleaned).slice(0, 80);
    return Goal.create({
      ownerId: owner,
      title: title || "New goal",
      statement: cleaned,
      status: "CLARIFYING",
      completeness: 5,
      timezone: "Asia/Kolkata",
    });
  },

  findOwned: (goalId: string, ownerId: string) => {
    const id = toObjectId(goalId);
    if (!id) {
      return null;
    }
    return Goal.findOne({ _id: id, ownerId: ownerFilter(ownerId) });
  },

  listOwned: (ownerId: string) =>
    Goal.find({ ownerId: ownerFilter(ownerId) })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),

  addMessage: (input: {
    goalId: mongoose.Types.ObjectId;
    ownerId: mongoose.Types.ObjectId;
    role: "user" | "assistant";
    text: string;
    stepId?: string;
    control?: string;
  }) => GoalMessage.create(input),

  listMessages: (goalId: mongoose.Types.ObjectId) =>
    GoalMessage.find({ goalId }).sort({ createdAt: 1 }).limit(40).lean(),

  activeJob: (goalId: mongoose.Types.ObjectId) =>
    GoalJob.findOne({ goalId, status: { $in: ["queued", "running"] } }).sort({
      createdAt: -1,
    }),

  latestJob: (goalId: mongoose.Types.ObjectId) =>
    GoalJob.findOne({ goalId }).sort({ createdAt: -1 }),

  createJob: (input: {
    goalId: mongoose.Types.ObjectId;
    ownerId: mongoose.Types.ObjectId;
    jobType: GoalJobType;
  }) => GoalJob.create({ ...input, status: "queued" }),

  findJob: (jobId: string, goalId: mongoose.Types.ObjectId) => {
    const id = toObjectId(jobId);
    if (!id) {
      return null;
    }
    return GoalJob.findOne({ _id: id, goalId });
  },

  replaceSpaces: async (
    goalId: mongoose.Types.ObjectId,
    ownerId: mongoose.Types.ObjectId,
    spaceIds: mongoose.Types.ObjectId[],
  ) => {
    await GoalSpaceLink.deleteMany({ goalId, ownerId });
    if (spaceIds.length === 0) {
      return [];
    }
    await GoalSpaceLink.insertMany(
      spaceIds.map((spaceId) => ({ goalId, ownerId, spaceId })),
      { ordered: true },
    );
    return GoalSpaceLink.find({ goalId }).lean();
  },

  listSpaceLinks: async (goalId: mongoose.Types.ObjectId, ownerId: string) => {
    const links = await GoalSpaceLink.find({ goalId }).lean();
    const spaceIds = links.map((link) => link.spaceId);
    if (spaceIds.length === 0) {
      return [];
    }
    const spaces = await CreateSpace.find({
      _id: { $in: spaceIds },
      userId: ownerFilter(ownerId),
      deletedAt: null,
    })
      .select({ spacename: 1 })
      .lean();
    return spaces.map((space) => ({
      id: String(space._id),
      name: space.spacename || "Space",
    }));
  },

  removeOwned: async (goalId: string, ownerId: string) => {
    const goal = await goalRepository.findOwned(goalId, ownerId);
    if (!goal) {
      return null;
    }
    const id = goal._id;
    await Promise.all([
      GoalMessage.deleteMany({ goalId: id }),
      GoalJob.deleteMany({ goalId: id }),
      GoalSpaceLink.deleteMany({ goalId: id }),
      GoalOutbox.deleteMany({ goalId: id }),
      GoalDashboard.deleteMany({ goalId: id }),
      GoalEvidence.deleteMany({ goalId: id }),
      GoalPlanVersion.deleteMany({ goalId: id }),
      GoalRecommendation.deleteMany({ goalId: id }),
      GoalReview.deleteMany({ goalId: id }),
      GoalCheckin.deleteMany({ goalId: id }),
      GoalSnapshot.deleteMany({ goalId: id }),
      GoalResearchSession.deleteMany({ goalId: id }),
      GoalResearchEvidence.deleteMany({ goalId: id }),
    ]);
    await Goal.deleteOne({ _id: id, ownerId: goal.ownerId });
    return { goalId: String(id) };
  },

  ownedSpaces: (ownerId: string, spaceIds: string[]) => {
    const ids = spaceIds
      .map((id) => toObjectId(id))
      .filter((id): id is mongoose.Types.ObjectId => id != null);
    return CreateSpace.find({
      _id: { $in: ids },
      userId: ownerFilter(ownerId),
      deletedAt: null,
    })
      .select({ spacename: 1 })
      .lean();
  },
};
