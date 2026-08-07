import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import { StagedNotes, StagedTasks } from "../../Buddy/Modals/Staged.Modal.js";
import Plan, { IPlan, PlanCode } from "../Modals/Plan.modal.js";
import UserSubscription from "../Modals/UserSubscription.modal.js";

const UNLIMITED = -1;

const defaultPlans = [
  {
    code: "free" as const,
    name: "Free",
    description: "Start with focused limits for personal AI memory.",
    amount: 0,
    currency: "INR",
    interval: "forever" as const,
    limits: {
      spaces: 5,
      notes: 100,
      tasks: 100,
    },
    features: [
      "5 spaces",
      "100 notes",
      "100 tasks",
      "Basic AI summaries",
    ],
    sortOrder: 1,
  },
  {
    code: "pro" as const,
    name: "Buddy Pro",
    description: "Upgrade for unlimited spaces, notes, and tasks.",
    amount: 29900,
    currency: "INR",
    interval: "monthly" as const,
    limits: {
      spaces: UNLIMITED,
      notes: UNLIMITED,
      tasks: UNLIMITED,
    },
    features: [
      "Unlimited spaces",
      "Unlimited notes",
      "Unlimited tasks",
      "Priority AI processing",
    ],
    sortOrder: 2,
  },
];

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

export const seedDefaultPlans = async () => {
  await Promise.all(
    defaultPlans.map(plan =>
      Plan.updateOne(
        { code: plan.code },
        { $set: { ...plan, isActive: true } },
        { upsert: true },
      ),
    ),
  );
};

export const getPlansService = async () => {
  await seedDefaultPlans();
  const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();

  return {
    status: STATUS_CODE.OK,
    data: {
      plans,
    },
  };
};

export const getPlanByCode = async (code: PlanCode) => {
  await seedDefaultPlans();
  return Plan.findOne({ code, isActive: true });
};

export const getOrCreateUserSubscription = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  await seedDefaultPlans();

  const existing = await UserSubscription.findOne({ userId }).populate<{
    planId: IPlan;
  }>("planId");

  if (existing) {
    return existing;
  }

  const freePlan = await getPlanByCode("free");

  if (!freePlan) {
    return null;
  }

  return UserSubscription.create({
    userId,
    planId: freePlan._id,
    planCode: freePlan.code,
    status: "active",
    currentPeriodStart: new Date(),
  });
};

export const activatePlanForUser = async (
  userId: string,
  planId: mongoose.Types.ObjectId,
  planCode: PlanCode,
) => {
  const now = new Date();
  const currentPeriodEnd =
    planCode === "pro"
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : undefined;

  return UserSubscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        planId,
        planCode,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd,
        upgradedAt: planCode === "pro" ? now : undefined,
      },
    },
    { new: true, upsert: true },
  );
};

export const getUsageForUser = async (userId: string) => {
  const query = {
    userId: createIdFilter(userId),
  };

  const [spaces, notes, tasks] = await Promise.all([
    CreateSpace.countDocuments(query),
    StagedNotes.countDocuments(query),
    StagedTasks.countDocuments(query),
  ]);

  return { spaces, notes, tasks };
};

export const getUserPlanStatusService = async (userId: string) => {
  const subscription = await getOrCreateUserSubscription(userId);

  if (!subscription) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Invalid user id.",
    };
  }

  const plan =
    "limits" in subscription.planId
      ? subscription.planId
      : await Plan.findById(subscription.planId);
  const usage = await getUsageForUser(userId);

  return {
    status: STATUS_CODE.OK,
    data: {
      subscription,
      plan,
      usage,
    },
  };
};

export const validatePlanLimit = async (
  userId: string,
  resource: "spaces" | "notes" | "tasks",
  nextCount = 1,
) => {
  const status = await getUserPlanStatusService(userId);

  if (!status.data?.plan) {
    return {
      allowed: false,
      status: STATUS_CODE.BAD_REQUEST,
      message: status.message || "Plan is not available.",
    };
  }

  const limit = status.data.plan.limits[resource];
  const currentUsage = status.data.usage[resource];

  if (limit !== UNLIMITED && currentUsage + nextCount > limit) {
    return {
      allowed: false,
      status: STATUS_CODE.FORBIDDEN,
      message: `Free plan limit reached. Upgrade to Pro to create more ${resource}.`,
      data: {
        resource,
        limit,
        used: currentUsage,
        planCode: status.data.plan.code,
      },
    };
  }

  return {
    allowed: true,
    status: STATUS_CODE.OK,
    data: {
      resource,
      limit,
      used: currentUsage,
      planCode: status.data.plan.code,
    },
  };
};

export const switchToFreePlanService = async (userId: string) => {
  const freePlan = await getPlanByCode("free");

  if (!freePlan || !mongoose.isValidObjectId(userId)) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Unable to switch plan.",
    };
  }

  const subscription = await activatePlanForUser(userId, freePlan._id, "free");

  return {
    status: STATUS_CODE.OK,
    data: {
      message: "Free plan activated.",
      subscription,
    },
  };
};
