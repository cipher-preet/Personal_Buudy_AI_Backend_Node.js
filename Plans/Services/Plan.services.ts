import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import Plan, {
  IPlan,
  MarketplaceAccess,
  PlanCode,
  PlanInterval,
} from "../Modals/Plan.modal.js";
import UserSubscription from "../Modals/UserSubscription.modal.js";

const UNLIMITED = -1;
const MS_PER_HOUR = 60 * 60 * 1000;
const MAX_LISTENING_SESSION_MS = 4 * 60 * 60 * 1000;

export const PLAN_RESOURCES = [
  "notesRecordingHours",
  "meetingRecordingHours",
  "mindmaps",
  "documents",
  "goals",
] as const;

export type PlanResource = (typeof PLAN_RESOURCES)[number];

const ALL_INDIAN_LANGUAGES = [
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
    yearlyAmount: 0,
    currency: "INR",
    interval: "forever" as const,
    limits: {
      notesRecordingHours: 2,
      meetingRecordingHours: 10,
      mindmaps: 10,
      documents: 10,
      goals: 2,
      marketplaceAccess: "none" as MarketplaceAccess,
    },
    languages: ALL_INDIAN_LANGUAGES,
    features: [
      "2 hours of notes recording",
      "10 hours of meeting recording",
      "10 mindmaps and 10 documents",
      "2 goal tracking",
      "11 Indian languages",
      "Marketplace browse only",
    ],
    sortOrder: 1,
  },
  {
    code: "pro" as const,
    name: "Pro",
    description: "For people who capture every day",
    amount: 49900,
    yearlyAmount: 360000,
    currency: "INR",
    interval: "monthly" as const,
    limits: {
      notesRecordingHours: 100,
      meetingRecordingHours: 100,
      mindmaps: 200,
      documents: 200,
      goals: 50,
      marketplaceAccess: "limited" as MarketplaceAccess,
    },
    languages: ALL_INDIAN_LANGUAGES,
    features: [
      "100 hours of notes recording",
      "100 hours of meeting recording",
      "200 mindmaps and 200 documents",
      "50 goal tracking",
      "11 Indian languages",
      "Limited marketplace access",
    ],
    sortOrder: 2,
  },
  {
    code: "business" as const,
    name: "Business",
    description: "Unlimited capture with full marketplace access",
    amount: 99900,
    yearlyAmount: 720000,
    currency: "INR",
    interval: "monthly" as const,
    limits: {
      notesRecordingHours: UNLIMITED,
      meetingRecordingHours: UNLIMITED,
      mindmaps: UNLIMITED,
      documents: UNLIMITED,
      goals: UNLIMITED,
      marketplaceAccess: "full" as MarketplaceAccess,
    },
    languages: ALL_INDIAN_LANGUAGES,
    features: [
      "Unlimited notes recording",
      "Unlimited meeting recording",
      "Unlimited mindmaps and documents",
      "Unlimited goal tracking",
      "11 Indian languages",
      "Full marketplace access",
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
        {
          $set: { ...plan, isActive: true },
          // Drop legacy billing/limit keys so Mongoose defaults cannot zero out new quotas.
          $unset: {
            quarterlyAmount: 1,
            "limits.spaces": 1,
            "limits.notes": 1,
            "limits.tasks": 1,
            "limits.recordingHours": 1,
          },
        },
        { upsert: true },
      ),
    ),
  );
};

/** Seed catalog once per process — status reads must not hit stale Pro docs with default 0 hrs. */
let plansSeedPromise: Promise<void> | null = null;
export const ensurePlansSeeded = async () => {
  if (!plansSeedPromise) {
    plansSeedPromise = seedDefaultPlans().catch((error) => {
      plansSeedPromise = null;
      throw error;
    });
  }
  await plansSeedPromise;
};

export const getPlansService = async () => {
  await ensurePlansSeeded();
  const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();

  return {
    status: STATUS_CODE.OK,
    data: {
      plans,
    },
  };
};

export const getPlanByCode = async (code: PlanCode) => {
  await ensurePlansSeeded();
  return Plan.findOne({ code, isActive: true });
};

const hoursFromMs = (ms = 0) => Number((Math.max(0, ms) / MS_PER_HOUR).toFixed(4));

const limitHoursToMs = (limit: number) =>
  limit === UNLIMITED ? UNLIMITED : Math.max(0, limit) * MS_PER_HOUR;

const resolveNotesRecordingMs = (subscription?: {
  notesRecordingMsUsed?: number | null;
  recordingMsUsed?: number | null;
} | null) =>
  Math.max(
    0,
    subscription?.notesRecordingMsUsed ?? subscription?.recordingMsUsed ?? 0,
  );

const activeListeningUnreportedMs = (subscription?: {
  activeListening?: {
    startedAt?: Date | string | null;
    reportedMs?: number | null;
  } | null;
} | null) => {
  const session = subscription?.activeListening;
  if (!session?.startedAt) {
    return 0;
  }
  const elapsedMs = Math.min(
    Math.max(0, Date.now() - new Date(session.startedAt).getTime()),
    MAX_LISTENING_SESSION_MS,
  );
  return Math.max(0, elapsedMs - (session.reportedMs || 0));
};

const isPaidPlanExpired = (subscription: {
  planCode?: string | null;
  status?: string | null;
  currentPeriodEnd?: Date | string | null;
  billingInterval?: string | null;
}) => {
  if (!subscription?.planCode || subscription.planCode === "free") {
    return false;
  }
  if (subscription.status === "expired" || subscription.status === "cancelled") {
    return true;
  }
  if (!subscription.currentPeriodEnd) {
    return false;
  }
  return new Date(subscription.currentPeriodEnd).getTime() <= Date.now();
};

/**
 * Bill any open listening session, then demote lapsed paid plans to Free
 * without wiping usage counters (prevents free-quota reset on expiry).
 */
export const ensureEffectiveSubscription = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  // Plan catalog is seeded at process boot (index.ts), not on every status/read.

  let subscription = await UserSubscription.findOne({ userId }).populate<{
    planId: IPlan;
  }>("planId");

  if (!subscription) {
    const freePlan = await getPlanByCode("free");
    if (!freePlan) {
      return null;
    }
    const created = await UserSubscription.create({
      userId,
      planId: freePlan._id,
      planCode: freePlan.code,
      billingInterval: "forever",
      status: "active",
      currentPeriodStart: new Date(),
    });
    return UserSubscription.findById(created._id).populate<{ planId: IPlan }>(
      "planId",
    );
  }

  if (!isPaidPlanExpired(subscription)) {
    return subscription;
  }

  // Persist any open listening burn without re-entering ensureEffectiveSubscription.
  const unreportedMs = activeListeningUnreportedMs(subscription);
  if (unreportedMs > 0) {
    await UserSubscription.updateOne(
      { userId },
      {
        $inc: {
          notesRecordingMsUsed: unreportedMs,
          recordingMsUsed: unreportedMs,
        },
      },
    );
  }

  const freePlan = await getPlanByCode("free");
  if (!freePlan) {
    return subscription;
  }

  return UserSubscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        planId: freePlan._id,
        planCode: "free",
        billingInterval: "forever",
        status: "active",
        currentPeriodStart: new Date(),
      },
      $unset: {
        currentPeriodEnd: 1,
        upgradedAt: 1,
        activeListening: 1,
      },
    },
    { new: true },
  ).populate<{ planId: IPlan }>("planId");
};

export const getOrCreateUserSubscription = async (userId: string) =>
  ensureEffectiveSubscription(userId);

export const getPlanChargeAmount = (
  plan: Pick<IPlan, "amount" | "yearlyAmount">,
  interval: Extract<PlanInterval, "monthly" | "yearly"> = "monthly",
) => {
  if (interval === "yearly") {
    return plan.yearlyAmount || 0;
  }

  return plan.amount;
};

type ActivatePlanOptions = {
  /** Defaults to true for paid plans, false for free (preserves usage on downgrade). */
  resetUsage?: boolean;
};

export const activatePlanForUser = async (
  userId: string,
  planId: mongoose.Types.ObjectId,
  planCode: PlanCode,
  billingInterval: PlanInterval = planCode === "free" ? "forever" : "monthly",
  options: ActivatePlanOptions = {},
) => {
  // Always settle open listening before plan changes.
  await settleListeningUsage(userId);

  const now = new Date();
  const periodDays =
    billingInterval === "yearly" ? 365 : billingInterval === "monthly" ? 30 : 0;
  const currentPeriodEnd =
    periodDays > 0
      ? new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
      : undefined;
  const resetUsage = options.resetUsage ?? planCode !== "free";

  const $set: Record<string, unknown> = {
    userId,
    planId,
    planCode,
    billingInterval,
    status: "active",
    currentPeriodStart: now,
    upgradedAt: planCode === "free" ? undefined : now,
  };

  if (currentPeriodEnd) {
    $set.currentPeriodEnd = currentPeriodEnd;
  }

  if (resetUsage) {
    $set.recordingMsUsed = 0;
    $set.notesRecordingMsUsed = 0;
    $set.meetingRecordingMsUsed = 0;
  }

  const update: Record<string, unknown> = {
    $set,
    $unset: {
      activeListening: 1,
    },
  };

  if (!currentPeriodEnd) {
    (update.$unset as Record<string, number>).currentPeriodEnd = 1;
  }

  return UserSubscription.findOneAndUpdate({ userId }, update, {
    new: true,
    upsert: true,
  });
};

export const getUsageForUser = async (userId: string) => {
  const userFilter = {
    userId: createIdFilter(userId),
  };
  const ownerFilter = {
    ownerId: createIdFilter(userId),
  };

  const notDeleted = {
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };

  const [mindmaps, documents, goals, subscription] = await Promise.all([
    mongoose.connection.collection("spaceMindmaps").countDocuments({
      ...userFilter,
      ...notDeleted,
    }),
    mongoose.connection.collection("spaceDocuments").countDocuments({
      ...userFilter,
      ...notDeleted,
    }),
    mongoose.connection.collection("goals").countDocuments(ownerFilter),
    UserSubscription.findOne({ userId })
      .select(
        "notesRecordingMsUsed recordingMsUsed meetingRecordingMsUsed activeListening",
      )
      .lean(),
  ]);

  const persistedNotesMs = resolveNotesRecordingMs(subscription);
  const liveUnreportedMs = activeListeningUnreportedMs(subscription);
  const notesRecordingMs = persistedNotesMs + liveUnreportedMs;
  const meetingRecordingMs = Math.max(
    0,
    subscription?.meetingRecordingMsUsed || 0,
  );

  return {
    notesRecordingHours: hoursFromMs(notesRecordingMs),
    notesRecordingMs,
    notesRecordingMsPersisted: persistedNotesMs,
    notesRecordingMsLiveUnreported: liveUnreportedMs,
    meetingRecordingHours: hoursFromMs(meetingRecordingMs),
    meetingRecordingMs,
    mindmaps,
    documents,
    goals,
    // Back-compat aliases for older clients during rollout
    recordingHours: hoursFromMs(notesRecordingMs),
    recordingMs: notesRecordingMs,
  };
};

const resolveLimitHours = (
  limits: { notesRecordingHours?: number; meetingRecordingHours?: number; recordingHours?: number } | null | undefined,
  key: "notesRecordingHours" | "meetingRecordingHours",
) => {
  const value = Number(limits?.[key]);
  if (Number.isFinite(value) && (value < 0 || value > 0)) {
    return value;
  }
  // Legacy Pro/Free docs may only have recordingHours; Mongoose defaulted the new key to 0.
  if (key === "notesRecordingHours") {
    const legacy = Number((limits as { recordingHours?: number } | null | undefined)?.recordingHours);
    if (Number.isFinite(legacy)) {
      return legacy;
    }
  }
  return Number.isFinite(value) ? value : 0;
};

export const getUserPlanStatusService = async (userId: string) => {
  await ensurePlansSeeded();
  const subscription = await ensureEffectiveSubscription(userId);

  if (!subscription) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Invalid user id.",
    };
  }

  // Re-load plan after seed so populated docs pick up migrated limits/features.
  const plan = await Plan.findById(
    subscription.planId && typeof subscription.planId === "object" && "_id" in subscription.planId
      ? (subscription.planId as { _id: unknown })._id
      : subscription.planId,
  ).lean();
  const usage = await getUsageForUser(userId);
  const notesLimitMs = limitHoursToMs(resolveLimitHours(plan?.limits, "notesRecordingHours"));
  const meetingLimitMs = limitHoursToMs(
    resolveLimitHours(plan?.limits, "meetingRecordingHours"),
  );

  return {
    status: STATUS_CODE.OK,
    data: {
      subscription,
      plan,
      usage,
      entitlement: {
        planCode: plan?.code || subscription.planCode,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd || null,
        notesRemainingMs:
          notesLimitMs === UNLIMITED
            ? UNLIMITED
            : Math.max(0, notesLimitMs - (usage.notesRecordingMs || 0)),
        meetingRemainingMs:
          meetingLimitMs === UNLIMITED
            ? UNLIMITED
            : Math.max(0, meetingLimitMs - (usage.meetingRecordingMs || 0)),
        isListeningActive: Boolean(subscription.activeListening?.startedAt),
      },
    },
  };
};

const isRecordingResource = (
  resource: PlanResource,
): resource is "notesRecordingHours" | "meetingRecordingHours" =>
  resource === "notesRecordingHours" || resource === "meetingRecordingHours";

export const validatePlanLimit = async (
  userId: string,
  resource: PlanResource,
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

  if (isRecordingResource(resource)) {
    const usedMs =
      resource === "notesRecordingHours"
        ? usage.notesRecordingMs || 0
        : usage.meetingRecordingMs || 0;
    const limitMs = limitHoursToMs(Number(limit));
    const extraMs = Math.max(0, nextCount);
    const label =
      resource === "notesRecordingHours" ? "notes recording" : "meeting recording";
    const remainingMs =
      limitMs === UNLIMITED ? UNLIMITED : Math.max(0, limitMs - usedMs);

    // Exhausted even with nextCount=0 (cannot start / continue).
    if (limitMs !== UNLIMITED && (remainingMs <= 0 || usedMs + extraMs > limitMs)) {
      return {
        allowed: false,
        status: STATUS_CODE.FORBIDDEN,
        message: `${label} time limit reached. Upgrade your plan to continue.`,
        data: {
          resource,
          limit,
          used: hoursFromMs(usedMs),
          usedMs,
          remainingMs: Math.max(0, remainingMs),
          planCode: status.data.plan.code,
          reason: "quota_exhausted" as const,
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
        remainingMs,
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
        reason: "quota_exhausted" as const,
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

export const addNotesRecordingUsage = async (userId: string, durationMs = 0) => {
  const extraMs = Math.max(0, Math.round(durationMs));
  // Use persisted counters for billing (live unreported is what we're applying).
  await ensureEffectiveSubscription(userId);
  const status = await getUserPlanStatusService(userId);

  if (!status.data?.plan) {
    return {
      allowed: false,
      status: STATUS_CODE.BAD_REQUEST,
      message: status.message || "Plan is not available.",
    };
  }

  const limit = status.data.plan.limits.notesRecordingHours;
  const usedMs = status.data.usage.notesRecordingMsPersisted ??
    Math.max(
      0,
      (status.data.usage.notesRecordingMs || 0) -
        (status.data.usage.notesRecordingMsLiveUnreported || 0),
    );
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
          notesRecordingMsUsed: appliedMs,
          recordingMsUsed: appliedMs,
          "activeListening.reportedMs": appliedMs,
        },
      },
    );
  }

  const nextRemaining =
    limitMs === UNLIMITED ? UNLIMITED : Math.max(0, remainingMs - appliedMs);
  const exhausted = nextRemaining === 0 && limitMs !== UNLIMITED;

  return {
    allowed: !exhausted,
    status: exhausted ? STATUS_CODE.FORBIDDEN : STATUS_CODE.OK,
    message: exhausted
      ? "Notes recording time limit reached. Upgrade your plan to keep listening."
      : undefined,
    data: {
      resource: "notesRecordingHours" as const,
      limit,
      used: hoursFromMs(usedMs + appliedMs),
      usedMs: usedMs + appliedMs,
      addedMs: appliedMs,
      remainingMs: nextRemaining,
      planCode: status.data.plan.code,
      reason: exhausted ? ("quota_exhausted" as const) : undefined,
      forceStop: exhausted,
    },
  };
};

/** @deprecated Use addNotesRecordingUsage */
export const addRecordingUsage = addNotesRecordingUsage;

export const addMeetingRecordingUsage = async (
  userId: string,
  durationMs = 0,
) => {
  const extraMs = Math.max(0, Math.round(durationMs));
  if (extraMs <= 0) {
    const quota = await validatePlanLimit(userId, "meetingRecordingHours", 0);
    return quota;
  }

  const status = await getUserPlanStatusService(userId);

  if (!status.data?.plan) {
    return {
      allowed: false,
      status: STATUS_CODE.BAD_REQUEST,
      message: status.message || "Plan is not available.",
    };
  }

  const limit = status.data.plan.limits.meetingRecordingHours;
  const usedMs = status.data.usage.meetingRecordingMs || 0;
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
          meetingRecordingMsUsed: appliedMs,
        },
      },
    );
  }

  const nextRemaining =
    limitMs === UNLIMITED ? UNLIMITED : Math.max(0, remainingMs - appliedMs);
  const blocked = nextRemaining === 0 && appliedMs === 0 && limitMs !== UNLIMITED;

  return {
    allowed: !blocked,
    status: blocked ? STATUS_CODE.FORBIDDEN : STATUS_CODE.OK,
    message: blocked
      ? "Meeting recording time limit reached. Upgrade your plan to continue."
      : undefined,
    data: {
      resource: "meetingRecordingHours" as const,
      limit,
      used: hoursFromMs(usedMs + appliedMs),
      usedMs: usedMs + appliedMs,
      addedMs: appliedMs,
      remainingMs: nextRemaining,
      planCode: status.data.plan.code,
      reason: blocked ? ("quota_exhausted" as const) : undefined,
    },
  };
};

export const beginListeningUsage = async (userId: string, spaceId: string) => {
  await settleListeningUsage(userId);

  const quota = await validatePlanLimit(userId, "notesRecordingHours", 0);

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

/** Persist unreported active-listening time without ending the session. */
export const reportListeningUsage = async (userId: string) => {
  await ensureEffectiveSubscription(userId);

  const subscription = await UserSubscription.findOne({ userId }).select(
    "activeListening",
  );
  const session = subscription?.activeListening;
  if (!session?.startedAt) {
    const status = await getUserPlanStatusService(userId);
    return {
      allowed: true,
      status: STATUS_CODE.OK,
      data: {
        resource: "notesRecordingHours" as const,
        remainingMs: status.data?.entitlement?.notesRemainingMs ?? 0,
        forceStop: false,
        planCode: status.data?.plan?.code,
        active: false,
      },
    };
  }

  const unreportedMs = activeListeningUnreportedMs(subscription);
  if (unreportedMs > 0) {
    const billed = await addNotesRecordingUsage(userId, unreportedMs);
    return {
      ...billed,
      data: {
        ...billed.data,
        forceStop: Boolean(billed.data && "forceStop" in billed.data && billed.data.forceStop),
        active: true,
      },
    };
  }

  const quota = await validatePlanLimit(userId, "notesRecordingHours", 0);
  return {
    ...quota,
    data: {
      ...quota.data,
      forceStop: !quota.allowed,
      active: true,
      addedMs: 0,
    },
  };
};

const settleListeningUsage = async (userId: string) => {
  const subscription = await UserSubscription.findOne({ userId }).select(
    "activeListening",
  );

  const session = subscription?.activeListening;
  if (session?.startedAt) {
    const unreportedMs = activeListeningUnreportedMs(subscription);
    if (unreportedMs > 0) {
      await addNotesRecordingUsage(userId, unreportedMs);
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

export const endListeningUsage = async (userId: string) => {
  await settleListeningUsage(userId);
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
    { resetUsage: false },
  );

  return {
    status: STATUS_CODE.OK,
    data: {
      message: "Free plan activated.",
      subscription,
    },
  };
};
