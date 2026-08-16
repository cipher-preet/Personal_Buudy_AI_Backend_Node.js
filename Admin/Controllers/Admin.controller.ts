import mongoose from "mongoose";
import { NextFunction, Request, Response } from "express";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import User from "../../Authentication/Modals/user.modal.js";
import { CreateSpace } from "../../Buddy/Modals/Home.Modal.js";
import { StagedNotes, StagedTasks } from "../../Buddy/Modals/Staged.Modal.js";
import Plan from "../../Plans/Modals/Plan.modal.js";
import UserSubscription from "../../Plans/Modals/UserSubscription.modal.js";
import Payment from "../../Payments/Modals/Payment.modal.js";

const aiCollections = [
  "conversations",
  "audio_chunks",
  "transcript_chunks",
  "conversation_windows",
  "extraction_runs",
  "conversation_summaries",
  "space_memory",
  "notes",
  "tasks",
  "stagedNotes",
  "stagedTasks",
  "stagedDecisions",
  "stagedIssues",
];

const toMongoId = (value: string): string | mongoose.Types.ObjectId => {
  if (typeof value === "string" && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  return value;
};

const idCandidates = (value: string): Array<string | mongoose.Types.ObjectId> => {
  const mongoId = toMongoId(value);
  return mongoId === value ? [value] : [mongoId, value];
};

const pageOptions = (req: Request) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildPagination = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  pages: Math.max(Math.ceil(total / limit), 1),
  hasNextPage: page * limit < total,
  hasPreviousPage: page > 1,
});

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const dateRangeFromQuery = (req: Request) => {
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(now.getDate() - 29);

  const start =
    typeof req.query.startDate === "string" && req.query.startDate
      ? new Date(req.query.startDate)
      : defaultStart;
  const end =
    typeof req.query.endDate === "string" && req.query.endDate
      ? new Date(req.query.endDate)
      : now;

  return {
    startDate: startOfDay(Number.isNaN(start.getTime()) ? defaultStart : start),
    endDate: endOfDay(Number.isNaN(end.getTime()) ? now : end),
  };
};

const paisaToRupees = (amount: number) => Math.round((amount / 100) * 100) / 100;

const safeRegex = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

const normalizeDocument = (document: any) => {
  if (!document) {
    return document;
  }

  const plain =
    typeof document.toObject === "function" ? document.toObject() : document;

  return {
    ...plain,
    id: String(plain._id),
  };
};

export const requireAdminAccess = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    return ErrorResponse(
      res,
      STATUS_CODE.INTERNAL_SERVER_ERROR,
      "Admin API is not configured. Set ADMIN_API_KEY on the backend.",
    );
  }

  const headerKey = req.headers["x-admin-key"];
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length).trim()
    : undefined;
  const providedKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

  if (providedKey === configuredKey || bearerToken === configuredKey) {
    return next();
  }

  return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Invalid admin key.");
};

export const getAdminOverviewController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { startDate, endDate } = dateRangeFromQuery(req);

    const [
      users,
      verifiedUsers,
      newUsers24h,
      newUsersToday,
      newUsersInRange,
      spaces,
      activeSpaces,
      stagedNotes,
      stagedTasks,
      payments,
      paidPayments,
      totalRevenueResult,
      todayRevenueResult,
      rangeRevenueResult,
      subscriptions,
      proSubscriptions,
      recentUsers,
      recentPayments,
      recentConversations,
      conversationsByStatus,
      userGrowth,
      salesGrowth,
      activeUsersFromSpaces,
      activeUsersFromPayments,
      activeUsersFromStagedNotes,
      activeUsersFromStagedTasks,
      activeUsersFromConversations,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ createdAt: { $gte: since24h } }),
      User.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      CreateSpace.countDocuments({ deletedAt: null }),
      CreateSpace.countDocuments({ deletedAt: null, isListning: true }),
      StagedNotes.countDocuments(),
      StagedTasks.countDocuments(),
      Payment.countDocuments(),
      Payment.countDocuments({ status: "paid" }),
      Payment.aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: "paid",
            paidAt: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: "paid",
            paidAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $group: { _id: "$currency", amount: { $sum: "$amount" } } },
      ]),
      UserSubscription.countDocuments({ status: "active" }),
      UserSubscription.countDocuments({ status: "active", planCode: "pro" }),
      User.find({ createdAt: { $gte: startDate, $lte: endDate } })
        .select("name email phone provider avatar isVerified createdAt")
        .sort({ _id: -1 })
        .limit(24)
        .lean(),
      Payment.find({ createdAt: { $gte: startDate, $lte: endDate } })
        .populate("userId", "name email phone")
        .select("amount currency status planCode createdAt paidAt userId")
        .sort({ _id: -1 })
        .limit(18)
        .lean(),
      mongoose.connection.collection("conversations").countDocuments({
        createdAt: { $gte: since7d },
      }),
      mongoose.connection.collection("conversations").aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      User.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { status: "paid", paidAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      CreateSpace.distinct("userId", { updatedAt: { $gte: since30d } }),
      Payment.distinct("userId", { updatedAt: { $gte: since30d } }),
      StagedNotes.distinct("userId", { updatedAt: { $gte: since30d } }),
      StagedTasks.distinct("userId", { updatedAt: { $gte: since30d } }),
      mongoose.connection.collection("conversations").distinct("userId", {
        updatedAt: { $gte: since30d },
      }),
    ]);

    const activeUserIds = new Set(
      [
        ...activeUsersFromSpaces,
        ...activeUsersFromPayments,
        ...activeUsersFromStagedNotes,
        ...activeUsersFromStagedTasks,
        ...activeUsersFromConversations,
      ]
        .filter(Boolean)
        .map(item => String(item)),
    );
    const totalRevenue = totalRevenueResult.map(item => ({
      currency: item._id || "INR",
      amount: paisaToRupees(item.amount),
      amountInPaisa: item.amount,
    }));
    const todayRevenue = todayRevenueResult.map(item => ({
      currency: item._id || "INR",
      amount: paisaToRupees(item.amount),
      amountInPaisa: item.amount,
    }));
    const rangeRevenue = rangeRevenueResult.map(item => ({
      currency: item._id || "INR",
      amount: paisaToRupees(item.amount),
      amountInPaisa: item.amount,
    }));

    return SuccessResponse(res, STATUS_CODE.OK, {
      filters: {
        startDate,
        endDate,
      },
      stats: {
        users,
        verifiedUsers,
        newUsers24h,
        newUsersToday,
        newUsersInRange,
        spaces,
        activeSpaces,
        stagedNotes,
        stagedTasks,
        payments,
        paidPayments,
        activeSubscriptions: subscriptions,
        proSubscriptions,
        mau: activeUserIds.size,
        totalSales: totalRevenue,
        todaySales: todayRevenue,
        rangeSales: rangeRevenue,
        revenue: totalRevenue,
        recentAiConversations7d: recentConversations,
      },
      charts: {
        conversationsByStatus: conversationsByStatus.map(item => ({
          status: item._id || "UNKNOWN",
          count: item.count,
        })),
        userGrowth: userGrowth.map(item => ({
          date: item._id,
          users: item.count,
        })),
        salesGrowth: salesGrowth.map(item => ({
          date: item._id,
          sales: paisaToRupees(item.amount),
          salesInPaisa: item.amount,
          payments: item.count,
        })),
      },
      recentUsers: recentUsers.map(normalizeDocument),
      recentPayments: recentPayments.map(payment => ({
        ...normalizeDocument(payment),
        amount: paisaToRupees(payment.amount),
        amountInPaisa: payment.amount,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminUsersController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit, skip } = pageOptions(req);
    const search = safeRegex(req.query.search);
    const query: Record<string, any> = {};

    if (search) {
      query.$or = [{ name: search }, { email: search }];
      if (/^\d+$/.test(String(req.query.search))) {
        query.$or.push({ phone: Number(req.query.search) });
      }
    }

    if (typeof req.query.provider === "string" && req.query.provider !== "all") {
      query.provider = req.query.provider;
    }

    if (req.query.verified === "true" || req.query.verified === "false") {
      query.isVerified = req.query.verified === "true";
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select("-password -__v")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const userIds = users.map(user => user._id);
    const [subscriptions, spaceCounts, activeListeningCounts] = await Promise.all([
      UserSubscription.find({ userId: { $in: userIds } })
        .populate("planId", "name code")
        .lean(),
      CreateSpace.aggregate([
        { $match: { userId: { $in: userIds }, deletedAt: null } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
      CreateSpace.aggregate([
        {
          $match: {
            userId: { $in: userIds },
            deletedAt: null,
            isListning: true,
          },
        },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
    ]);

    const subscriptionByUserId = new Map(
      subscriptions.map(subscription => [String(subscription.userId), subscription]),
    );
    const spacesByUserId = new Map(
      spaceCounts.map(item => [String(item._id), item.count]),
    );
    const activeListeningByUserId = new Map(
      activeListeningCounts.map(item => [String(item._id), item.count]),
    );

    return SuccessResponse(res, STATUS_CODE.OK, {
      items: users.map(user => ({
        ...normalizeDocument(user),
        subscription: subscriptionByUserId.get(String(user._id)) || null,
        spacesCount: spacesByUserId.get(String(user._id)) || 0,
        activeListeningSpacesCount:
          activeListeningByUserId.get(String(user._id)) || 0,
        hasActiveListener: Boolean(activeListeningByUserId.get(String(user._id))),
      })),
      pagination: buildPagination(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminUserDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = String(req.params.userId);

    if (!mongoose.isValidObjectId(userId)) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Invalid user id.");
    }

    const user = await User.findById(userId).select("-password -__v").lean();

    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found.");
    }

    const userFilter: Record<string, any> = { userId: { $in: idCandidates(userId) } };
    const [
      subscription,
      payments,
      spaces,
      notesCount,
      tasksCount,
      publishedNotesCount,
      publishedTasksCount,
      conversationsCount,
      summariesCount,
      activeListeningSpacesCount,
      paidPaymentSummary,
    ] = await Promise.all([
      UserSubscription.findOne({ userId }).populate("planId", "name code limits amount").lean(),
      Payment.find({ userId }).sort({ _id: -1 }).limit(10).lean(),
      CreateSpace.find(userFilter).sort({ _id: -1 }).limit(20).lean(),
      StagedNotes.countDocuments(userFilter),
      StagedTasks.countDocuments(userFilter),
      mongoose.connection.collection("notes").countDocuments(userFilter),
      mongoose.connection.collection("tasks").countDocuments(userFilter),
      mongoose.connection.collection("conversations").countDocuments(userFilter),
      mongoose.connection.collection("conversation_summaries").countDocuments(userFilter),
      CreateSpace.countDocuments({ ...userFilter, deletedAt: null, isListning: true }),
      Payment.aggregate([
        { $match: { userId: toMongoId(userId), status: "paid" } },
        {
          $group: {
            _id: "$currency",
            purchases: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    return SuccessResponse(res, STATUS_CODE.OK, {
      user: normalizeDocument(user),
      subscription,
      payments: payments.map(payment => ({
        ...normalizeDocument(payment),
        amount: paisaToRupees(payment.amount),
        amountInPaisa: payment.amount,
      })),
      spaces: spaces.map(normalizeDocument),
      counts: {
        stagedNotes: notesCount,
        stagedTasks: tasksCount,
        publishedNotes: publishedNotesCount,
        publishedTasks: publishedTasksCount,
        totalNotes: notesCount + publishedNotesCount,
        totalTasks: tasksCount + publishedTasksCount,
        totalSpaces: spaces.filter(space => !space.deletedAt).length,
        activeListeningSpaces: activeListeningSpacesCount,
        conversations: conversationsCount,
        summaries: summariesCount,
        purchases: paidPaymentSummary.reduce((sum, item) => sum + item.purchases, 0),
        purchaseAmount: paidPaymentSummary.map(item => ({
          currency: item._id || "INR",
          amount: paisaToRupees(item.amount),
          amountInPaisa: item.amount,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminPaymentsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit, skip } = pageOptions(req);
    const search = safeRegex(req.query.search);
    const rawSearch =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const query: Record<string, any> = {};

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      query.status = req.query.status;
    }

    if (typeof req.query.userId === "string" && req.query.userId.trim()) {
      query.userId = req.query.userId.trim();
    }

    if (search) {
      const ownerQuery: Record<string, any> = {
        $or: [{ name: search }, { email: search }],
      };

      if (/^\d+$/.test(rawSearch)) {
        ownerQuery.$or.push({ phone: Number(rawSearch) });
      }

      if (mongoose.isValidObjectId(rawSearch)) {
        ownerQuery.$or.push({ _id: new mongoose.Types.ObjectId(rawSearch) });
      }

      const matchingOwners = await User.find(ownerQuery)
        .select("_id")
        .limit(500)
        .lean();
      const matchingOwnerIds = matchingOwners.map(owner => owner._id);

      query.$or = [
        { planCode: search },
        { receipt: search },
        { razorpayOrderId: search },
        { razorpayPaymentId: search },
        ...(matchingOwnerIds.length > 0
          ? [{ userId: { $in: matchingOwnerIds } }]
          : []),
      ];
    }

    const [total, payments] = await Promise.all([
      Payment.countDocuments(query),
      Payment.find(query)
        .populate("userId", "name email phone avatar")
        .populate("planId", "name code")
        .select("-rawOrder -rawPayment -razorpaySignature")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return SuccessResponse(res, STATUS_CODE.OK, {
      items: payments.map(normalizeDocument),
      pagination: buildPagination(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminPaymentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const statuses = ["created", "attempted", "paid", "failed", "refunded", "cancelled"];
    const status = String(req.body.status || "");

    if (!statuses.includes(status)) {
      return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Invalid payment status.");
    }

    const update: Record<string, unknown> = { status };

    if (status === "paid") {
      update.paidAt = new Date();
    }

    if (status === "failed") {
      update.failedAt = new Date();
    }

    const payment = await Payment.findByIdAndUpdate(req.params.paymentId, update, {
      new: true,
    }).lean();

    if (!payment) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Payment not found.");
    }

    return SuccessResponse(res, STATUS_CODE.OK, normalizeDocument(payment));
  } catch (error) {
    next(error);
  }
};

export const getAdminPlansController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const [plans, subscriptionsByPlan] = await Promise.all([
      Plan.find().sort({ sortOrder: 1 }).lean(),
      UserSubscription.aggregate([
        { $group: { _id: "$planCode", count: { $sum: 1 } } },
      ]),
    ]);

    const usageByPlan = new Map(subscriptionsByPlan.map(item => [item._id, item.count]));

    return SuccessResponse(res, STATUS_CODE.OK, {
      items: plans.map(plan => ({
        ...normalizeDocument(plan),
        subscriptionsCount: usageByPlan.get(plan.code) || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminPlanController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allowedFields = ["name", "description", "amount", "currency", "limits", "features", "isActive", "sortOrder"];
    const update = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
    );

    const plan = await Plan.findByIdAndUpdate(req.params.planId, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!plan) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Plan not found.");
    }

    return SuccessResponse(res, STATUS_CODE.OK, normalizeDocument(plan));
  } catch (error) {
    next(error);
  }
};

export const updateAdminSubscriptionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const statuses = ["active", "expired", "cancelled"];
    const update: Record<string, unknown> = {};

    if (req.body.status !== undefined) {
      const status = String(req.body.status);

      if (!statuses.includes(status)) {
        return ErrorResponse(res, STATUS_CODE.BAD_REQUEST, "Invalid subscription status.");
      }

      update.status = status;
    }

    if (req.body.currentPeriodEnd !== undefined) {
      update.currentPeriodEnd = req.body.currentPeriodEnd
        ? new Date(req.body.currentPeriodEnd)
        : null;
    }

    const subscription = await UserSubscription.findByIdAndUpdate(
      req.params.subscriptionId,
      update,
      { new: true, runValidators: true },
    ).lean();

    if (!subscription) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "Subscription not found.");
    }

    return SuccessResponse(res, STATUS_CODE.OK, normalizeDocument(subscription));
  } catch (error) {
    next(error);
  }
};

export const getAdminAiLayerController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const collectionCounts = await Promise.all(
      aiCollections.map(async collectionName => ({
        collection: collectionName,
        count: await mongoose.connection.collection(collectionName).countDocuments(),
      })),
    );

    const [recentConversations, extractionRuns, failedTranscripts] = await Promise.all([
      mongoose.connection
        .collection("conversations")
        .find({})
        .sort({ _id: -1 })
        .limit(10)
        .toArray(),
      mongoose.connection
        .collection("extraction_runs")
        .aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      mongoose.connection.collection("transcript_chunks").countDocuments({
        sttStatus: "failed",
      }),
    ]);

    return SuccessResponse(res, STATUS_CODE.OK, {
      collectionCounts,
      recentConversations: recentConversations.map(normalizeDocument),
      extractionRunsByStatus: extractionRuns.map(item => ({
        status: item._id || "UNKNOWN",
        count: item.count,
      })),
      failedTranscripts,
    });
  } catch (error) {
    next(error);
  }
};
