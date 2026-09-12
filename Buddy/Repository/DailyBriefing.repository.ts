import mongoose from "mongoose";
import { DailyBriefing } from "../Modals/DailyBriefing.Modal.js";

export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const BRIEFING_OMIT =
  "-missedCandidates -error -claimedBy -claimedAt -__v";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }
  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

export const briefingOwnerFromAuth = (
  authUserId?: string,
  requestedUserId?: unknown,
) => {
  if (!authUserId) {
    return null;
  }
  void requestedUserId;
  return authUserId;
};

export const parseBriefingDateKey = (value: unknown) => {
  if (value == null || value === "") {
    return { value: undefined as string | undefined };
  }
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value.trim())) {
    return { value: undefined, error: "Invalid 'date'. Use YYYY-MM-DD." };
  }
  return { value: value.trim() };
};

const mapItem = (item: Record<string, any>) => ({
  id: String(item?.id ?? ""),
  title: String(item?.title ?? ""),
  detail: String(item?.detail ?? ""),
});

const mapTask = (item: Record<string, any>) => ({
  id: String(item?.id ?? ""),
  title: String(item?.title ?? ""),
  meta: String(item?.meta ?? ""),
});

const mapMeeting = (item: Record<string, any>) => ({
  id: String(item?.id ?? ""),
  time: String(item?.time ?? ""),
  title: String(item?.title ?? ""),
  meta: String(item?.meta ?? ""),
});

const mapInsight = (item: Record<string, any>) => ({
  id: String(item?.id ?? ""),
  source: String(item?.source ?? ""),
  sourceType: String(item?.sourceType ?? ""),
  title: String(item?.title ?? ""),
  body: String(item?.body ?? ""),
  excerpt: String(item?.excerpt ?? ""),
  whyItMatters: String(item?.whyItMatters ?? ""),
  capturedAt: String(item?.capturedAt ?? ""),
  space: String(item?.space ?? ""),
  tags: Array.isArray(item?.tags)
    ? item.tags.map((tag: unknown) => String(tag)).filter(Boolean)
    : [],
});

const mapStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];

const mapItems = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => mapItem(item as Record<string, any>))
    : [];

export const mapBriefing = (doc: Record<string, any>) => ({
  userId: String(doc.userId),
  dateKey: doc.dateKey ?? "",
  timezone: doc.timezone ?? "",
  periodStartUtc: doc.periodStartUtc ?? null,
  periodEndUtc: doc.periodEndUtc ?? null,
  status: doc.status ?? "PENDING",
  skipReason: doc.skipReason ?? null,
  headline: doc.headline ?? "",
  overview: doc.overview ?? "",
  highlights: mapItems(doc.highlights),
  importantMoments: mapItems(doc.importantMoments),
  completed: mapItems(doc.completed),
  pendingTasks: mapItems(doc.pendingTasks),
  decisions: mapItems(doc.decisions),
  followUps: mapItems(doc.followUps),
  tomorrowFocus: mapItems(doc.tomorrowFocus),
  insights: Array.isArray(doc.insights)
    ? doc.insights.map((item: Record<string, any>) => mapInsight(item))
    : [],
  people: mapStringList(doc.people),
  topics: mapStringList(doc.topics),
  tasks: Array.isArray(doc.tasks)
    ? doc.tasks.map((item: Record<string, any>) => mapTask(item))
    : [],
  meetings: Array.isArray(doc.meetings)
    ? doc.meetings.map((item: Record<string, any>) => mapMeeting(item))
    : [],
  sourceStats: {
    transcriptCount: Number(doc.sourceStats?.transcriptCount ?? 0),
    taskCount: Number(doc.sourceStats?.taskCount ?? 0),
    noteCount: Number(doc.sourceStats?.noteCount ?? 0),
    eventCount: Number(doc.sourceStats?.eventCount ?? 0),
    reminderCount: Number(doc.sourceStats?.reminderCount ?? 0),
    pendingTranscriptCount: Number(
      doc.sourceStats?.pendingTranscriptCount ?? 0,
    ),
  },
  pipelineVersion: doc.pipelineVersion ?? "daily-briefing-v1",
  generatedAt: doc.generatedAt ?? null,
  updatedAt: doc.updatedAt ?? null,
});

const findBriefingDocument = (userId: string, dateKey?: string) => {
  const query: Record<string, unknown> = {
    userId: createIdFilter(userId),
  };
  if (dateKey) {
    query.dateKey = dateKey;
  }

  const finder = DailyBriefing.findOne(query)
    .select(BRIEFING_OMIT)
    .lean();

  return dateKey ? finder : finder.sort({ dateKey: -1 });
};

export const getDailyBriefingForUser = async (
  userId: string,
  dateKey?: string,
) => {
  const document = await findBriefingDocument(userId, dateKey);

  if (!document) {
    return { status: 404 as const, message: "Daily briefing not found." };
  }

  return {
    status: 200 as const,
    briefing: mapBriefing(document as Record<string, any>),
  };
};

/**
 * TEMPORARY test helper: ask Python orchestration to regenerate a briefing now.
 * Requires BUDDY_API_BASE (same base URL as the app buddyApiBase).
 */
export const forceGenerateDailyBriefingForUser = async (
  userId: string,
  options?: { date?: string; period?: "today" | "yesterday" },
) => {
  const buddyApiBase = process.env.BUDDY_API_BASE?.trim().replace(/\/$/, "");
  if (!buddyApiBase) {
    return {
      status: 503 as const,
      message:
        "BUDDY_API_BASE is not configured on Node. Set it to the Python /api/v1 base URL.",
    };
  }

  const period = options?.period === "yesterday" ? "yesterday" : "today";
  const body: Record<string, string> = {
    userId,
    period,
  };
  if (options?.date) {
    body.date = options.date;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const response = await fetch(`${buddyApiBase}/daily-briefing/force-generate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; result?: unknown; detail?: string; message?: string }
      | null;

    if (!response.ok) {
      const detail =
        (typeof payload?.detail === "string" && payload.detail) ||
        (typeof payload?.message === "string" && payload.message) ||
        `Python force-generate failed (${response.status}).`;
      return {
        status: (response.status >= 400 && response.status < 600
          ? response.status
          : 502) as 400 | 403 | 404 | 500 | 502,
        message: detail,
      };
    }

    return {
      status: 200 as const,
      result: payload?.result ?? payload,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Force generate timed out waiting for Python."
        : error instanceof Error
          ? error.message
          : "Force generate failed.";
    return { status: 502 as const, message };
  } finally {
    clearTimeout(timeout);
  }
};
