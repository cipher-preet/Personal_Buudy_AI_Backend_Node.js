import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import Plan, { IPlan, PlanCode, PlanInterval } from "../Modals/Plan.modal.js";
import UserSubscription from "../Modals/UserSubscription.modal.js";

const UNLIMITED = -1;
const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_LISTENING_SESSION_MS = 4 * 60 * 60 * 1000;
const CORE_LANGUAGES = ["English", "Hindi"];
const BUSINESS_LANGUAGES = [
  "English",
  "Hindi",
  "Bengali",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Odia",
];

const defaultPlans = [
  {
    code: "free" as const,
    name: "Free",
    description: "Start capturing with Buddy",
    amount: 0,
    quarterlyAmount: 0,
    currency: "INR",
    interval: "forever" as const,
    limits: {
      spaces: 5,
      notes: 100,
      tasks: 100,
      recordingHours: 2,
    },
    languages: CORE_LANGUAGES,
    features: [
      "Create up to 5 spaces",
      "2 hours of meeting recording",
      "Hindi and English support",
    ],
    sortOrder: 1,
  },
  {
    code: "pro" as const,
    name: "Pro",
    description: "For people who capture every day",
    amount: 29900,
    quarterlyAmount: 69900,
    currency: "INR",
    interval: "monthly" as const,
    limits: {
      spaces: UNLIMITED,
      notes: UNLIMITED,
      tasks: UNLIMITED,
      recordingHours: 100,
    },
    languages: CORE_LANGUAGES,
    features: [
      "Unlimited spaces",
      "100 hours of meeting recording",
      "Hindi and English support",
      "Daily briefing",
      "Goal monitor",
    ],
    sortOrder: 2,
  },
  {
    code: "business" as const,
    name: "Business",
    description: "For teams that work in every Indian language",
    amount: 69900,
    quarterlyAmount: 179900,
    currency: "INR",
    interval: "monthly" as const,
    limits: {
      spaces: UNLIMITED,
      notes: UNLIMITED,
      tasks: UNLIMITED,
      recordingHours: UNLIMITED,
    },
    languages: BUSINESS_LANGUAGES,
    features: [
      "Unlimited spaces",
      "Unlimited meeting recording",
      "11 Indian languages included",
      "Daily briefing",
      "Goal monitor",
      "Team workspaces",
    ],
    sortOrder: 3,
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
    billingInterval: "forever",
    status: "active",
    currentPeriodStart: new Date(),
  });
};

export const getPlanChargeAmount = (
  plan: Pick<IPlan, "amount" | "quarterlyAmount">,
  interval: Extract<PlanInterval, "monthly" | "quarterly"> = "monthly",
) => {
  if (interval === "quarterly") {
    return plan.quarterlyAmount || 0;
  }

  return plan.amount;
};

export const activatePlanForUser = async (
  userId: string,
  planId: mongoose.Types.ObjectId,
  planCode: PlanCode,
  billingInterval: PlanInterval = planCode === "free" ? "forever" : "monthly",
) => {
  const now = new Date();
  const periodDays =
    billingInterval === "quarterly" ? 90 : billingInterval === "monthly" ? 30 : 0;
  const currentPeriodEnd =
    periodDays > 0
      ? new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
      : undefined;

  return UserSubscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        planId,
        planCode,
        billingInterval,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd,
        upgradedAt: planCode === "free" ? undefined : now,
        recordingMsUsed: 0,
      },
      $unset: {
        activeListening: 1,
      },
    },
    { new: true, upsert: true },
  );
};

const hoursFromMs = (ms = 0) => Number((Math.max(0, ms) / MS_PER_HOUR).toFixed(4));

const limitHoursToMs = (limit: number) =>
  limit === UNLIMITED ? UNLIMITED : Math.max(0, limit) * MS_PER_HOUR;

export const getUsageForUser = async (userId: string) => {
  const userFilter = {
    userId: createIdFilter(userId),
  };

  const liveSpaces = await CreateSpace.find({
    ...userFilter,
    deletedAt: null,
  })
    .select("_id")
    .lean();

  const liveSpaceIds = liveSpaces.map(space => space._id);
  const liveSpaceIdFilter = {
    $in: [...liveSpaceIds, ...liveSpaceIds.map(spaceId => String(spaceId))],
  };

  const notDeleted = {
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };

  const [notes, tasks, subscription] = await Promise.all([
    liveSpaceIds.length
      ? mongoose.connection
          .collection("notes")
          .countDocuments({
            ...userFilter,
            spaceId: liveSpaceIdFilter,
            ...notDeleted,
          })
      : Promise.resolve(0),
    liveSpaceIds.length
      ? mongoose.connection
          .collection("tasks")
          .countDocuments({
            ...userFilter,
            spaceId: liveSpaceIdFilter,
            ...notDeleted,
          })
      : Promise.resolve(0),
    UserSubscription.findOne({ userId }).select("recordingMsUsed").lean(),
  ]);

  const recordingMs = Math.max(0, subscription?.recordingMsUsed || 0);

  return {
    spaces: liveSpaces.length,
    notes,
    tasks,
    recordingHours: hoursFromMs(recordingMs),
    recordingMs,
  };
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
  resource: "spaces" | "notes" | "tasks" | "recordingHours",
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
  const usage = status.data.usage;

  if (resource === "recordingHours") {
    const usedMs = usage.recordingMs || 0;
    const limitMs = limitHoursToMs(limit);
    const extraMs = Math.max(0, nextCount);

    if (limitMs !== UNLIMITED && usedMs + extraMs > limitMs) {
      return {
        allowed: false,
        status: STATUS_CODE.FORBIDDEN,
        message:
          "Recording time limit reached. Upgrade your plan to keep listening.",
        data: {
          resource,
          limit,
          used: hoursFromMs(usedMs),
          usedMs,
          remainingMs: Math.max(0, limitMs - usedMs),
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
        used: hoursFromMs(usedMs),
        usedMs,
        remainingMs: limitMs === UNLIMITED ? UNLIMITED : Math.max(0, limitMs - usedMs),
        planCode: status.data.plan.code,
      },
    };
  }

  const currentUsage = usage[resource];

  if (limit !== UNLIMITED && currentUsage + nextCount > limit) {
    return {
      allowed: false,
      status: STATUS_CODE.FORBIDDEN,
      message: `Plan limit reached. Upgrade your plan to create more ${resource}.`,
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

export const addRecordingUsage = async (userId: string, durationMs = 0) => {
  const extraMs = Math.max(0, Math.round(durationMs));
  const status = await getUserPlanStatusService(userId);

  if (!status.data?.plan) {
    return {
      allowed: false,
      status: STATUS_CODE.BAD_REQUEST,
      message: status.message || "Plan is not available.",
    };
  }

  const limit = status.data.plan.limits.recordingHours;
  const usedMs = status.data.usage.recordingMs || 0;
  const limitMs = limitHoursToMs(limit);
  const remainingMs =
    limitMs === UNLIMITED ? extraMs : Math.max(0, limitMs - usedMs);
  const appliedMs =
    limitMs === UNLIMITED ? extraMs : Math.min(extraMs, remainingMs);

  if (appliedMs > 0) {
    await UserSubscription.updateOne(
      { userId },
      {
        $inc: {
          recordingMsUsed: appliedMs,
          "activeListening.reportedMs": appliedMs,
        },
      },
    );
  }

  const nextRemaining =
    limitMs === UNLIMITED ? UNLIMITED : Math.max(0, remainingMs - appliedMs);

  return {
    allowed: nextRemaining !== 0,
    status: nextRemaining === 0 ? STATUS_CODE.FORBIDDEN : STATUS_CODE.OK,
    message:
      nextRemaining === 0
        ? "Recording time limit reached. Upgrade your plan to keep listening."
        : undefined,
    data: {
      resource: "recordingHours" as const,
      limit,
      used: hoursFromMs(usedMs + appliedMs),
      usedMs: usedMs + appliedMs,
      addedMs: appliedMs,
      remainingMs: nextRemaining,
      planCode: status.data.plan.code,
    },
  };
};

export const beginListeningUsage = async (userId: string, spaceId: string) => {
  await endListeningUsage(userId);

  const quota = await validatePlanLimit(userId, "recordingHours", 1);

  if (!quota.allowed) {
    return quota;
  }

  await UserSubscription.updateOne(
    { userId },
    {
      $set: {
        activeListening: {
          spaceId,
          startedAt: new Date(),
          reportedMs: 0,
        },
      },
    },
  );

  return quota;
};

export const endListeningUsage = async (userId: string) => {
  const subscription = await UserSubscription.findOne({ userId }).select(
    "activeListening recordingMsUsed",
  );

  const session = subscription?.activeListening;
  if (session?.startedAt) {
    const elapsedMs = Math.min(
      Math.max(0, Date.now() - new Date(session.startedAt).getTime()),
      MAX_LISTENING_SESSION_MS,
    );
    const unreportedMs = Math.max(0, elapsedMs - (session.reportedMs || 0));

    if (unreportedMs > 0) {
      await addRecordingUsage(userId, unreportedMs);
    }
  }

  await UserSubscription.updateOne(
    { userId },
    {
      $unset: {
        activeListening: 1,
      },
    },
  );
};

export const switchToFreePlanService = async (userId: string) => {
  const freePlan = await getPlanByCode("free");

  if (!freePlan || !mongoose.isValidObjectId(userId)) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Unable to switch plan.",
    };
  }

  const subscription = await activatePlanForUser(
    userId,
    freePlan._id,
    "free",
    "forever",
  );

  return {
    status: STATUS_CODE.OK,
    data: {
      message: "Free plan activated.",
      subscription,
    },
  };
};
