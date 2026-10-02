import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { CreateSpace } from "../Modals/Home.Modal.js";
import { DEFAULT_REMINDER_TIMEZONE } from "../reminderSchedule/constants.js";
import { dateKeyInTimeZone, zonedLocalToUtc } from "../reminderSchedule/time.js";
import {
  addDaysToKey,
  buildSnippet,
  escapeRegex,
  formatMinutesLabel,
  parseSearchQuery,
  scoreSearchMatch,
  SEARCH_TYPES,
  type ParsedSearchQuery,
  type SearchType,
} from "./searchQuery.js";

export type SearchResultItem = {
  type: SearchType;
  id: string;
  title: string;
  snippet: string;
  spaceId: string | null;
  spaceName: string | null;
  meetingId: string | null;
  /** ISO timestamp, or a YYYY-MM-DD key for date-only values (due dates, events). */
  date: string | null;
  dateKind: "created" | "due" | "started" | "scheduled" | "updated" | null;
  timeLabel: string | null;
  status: string | null;
  priority: string | null;
  score: number;
};

const CANDIDATES_PER_TYPE = 60;
const MEETING_CANDIDATES = 300;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;
const TIME_WINDOW_MINUTES = 60;
const DAY_MS = 86_400_000;

const idFilter = (id: string) =>
  mongoose.isValidObjectId(id) ? { $in: [id, new mongoose.Types.ObjectId(id)] } : id;

const notDeleted = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

const asText = (value: unknown) => (typeof value === "string" ? value : "");

const asIso = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

const ageInDays = (value: unknown, now: Date) => {
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00.000Z`
    : asIso(value);
  return iso ? (now.getTime() - new Date(iso).getTime()) / DAY_MS : null;
};

/** Every term must hit at least one field ("all"), or any term may ("any"). */
const textFilter = (terms: string[], fields: string[], mode: "all" | "any") => {
  if (terms.length === 0) {
    return null;
  }
  const clauses = terms.map((term) => ({
    $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(term), $options: "i" } })),
  }));
  return mode === "all" ? { $and: clauses } : { $or: clauses.flatMap((clause) => clause.$or) };
};

const rangeBoundsUtc = (query: ParsedSearchQuery, timeZone: string) => {
  if (!query.dateRange) {
    return null;
  }
  const start = zonedLocalToUtc(query.dateRange.from, "12:00 AM", timeZone);
  const endExclusive = zonedLocalToUtc(addDaysToKey(query.dateRange.to, 1), "12:00 AM", timeZone);
  return start && endExclusive ? { start, endExclusive } : null;
};

const minutesOfDay = (value: unknown, timeZone: string) => {
  const iso = asIso(value);
  if (!iso) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
};

const labelToMinutes = (label: string) => {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") {
    hour += 12;
  }
  return hour * 60 + Number(match[2]);
};

const withinTimeWindow = (minutes: number | null, target: number | null) =>
  target === null || (minutes !== null && Math.abs(minutes - target) <= TIME_WINDOW_MINUTES);

const isDoneTask = (doc: Record<string, any>) => {
  const operation = asText(doc.operation).toUpperCase();
  const status = asText(doc.status).toLowerCase();
  return operation === "DONE" || status === "done" || status === "completed";
};

type Context = {
  userId: string;
  query: ParsedSearchQuery;
  mode: "all" | "any";
  timeZone: string;
  now: Date;
  todayKey: string;
  bounds: { start: Date; endExclusive: Date } | null;
  spaceNames: Map<string, string>;
};

const phraseOf = (query: ParsedSearchQuery) => query.terms.join(" ");

const scoreItem = (
  context: Context,
  title: string,
  body: string,
  dateValue: unknown,
  bonus = 0,
) => {
  const { score, matchedTerms } = scoreSearchMatch({
    terms: context.query.terms,
    phrase: phraseOf(context.query),
    title,
    body,
    ageDays: ageInDays(dateValue, context.now),
  });
  const required = context.mode === "all" ? context.query.terms.length : 1;
  if (context.query.terms.length > 0 && matchedTerms < required) {
    return null;
  }
  return score + bonus;
};

const spaceRef = (context: Context, rawSpaceId: unknown) => {
  if (rawSpaceId === null || rawSpaceId === undefined || rawSpaceId === "") {
    return { spaceId: null, spaceName: null, orphaned: false };
  }
  const spaceId = String(rawSpaceId);
  const spaceName = context.spaceNames.get(spaceId);
  return spaceName === undefined
    ? { spaceId: null, spaceName: null, orphaned: true }
    : { spaceId, spaceName, orphaned: false };
};

const searchSpaces = async (context: Context): Promise<SearchResultItem[]> => {
  const filter: Record<string, any> = { userId: idFilter(context.userId), deletedAt: null };
  const text = textFilter(context.query.terms, ["spacename", "description"], context.mode);
  if (text) {
    Object.assign(filter, text);
  }
  if (context.bounds) {
    filter.createdAt = { $gte: context.bounds.start, $lt: context.bounds.endExclusive };
  }
  const docs = await CreateSpace.collection
    .find(filter)
    .project({ spacename: 1, description: 1, createdAt: 1, updatedAt: 1 })
    .sort({ _id: -1 })
    .limit(CANDIDATES_PER_TYPE)
    .toArray();

  return docs.flatMap((doc) => {
    const title = asText(doc.spacename) || "Untitled space";
    const description = asText(doc.description);
    const score = scoreItem(context, title, description, doc.updatedAt ?? doc.createdAt);
    if (score === null) {
      return [];
    }
    return [{
      type: "space" as const,
      id: String(doc._id),
      title,
      snippet: buildSnippet(description, context.query.terms),
      spaceId: String(doc._id),
      spaceName: title,
      meetingId: null,
      date: asIso(doc.updatedAt ?? doc.createdAt),
      dateKind: "updated" as const,
      timeLabel: null,
      status: null,
      priority: null,
      score,
    }];
  });
};

const taskDateFilter = (context: Context) => {
  if (!context.query.dateRange) {
    return null;
  }
  const { from, to } = context.query.dateRange;
  const bounds = context.bounds;
  const undated = { $or: [{ dueDate: null }, { dueDate: { $exists: false } }, { dueDate: "" }] };
  return {
    $or: [
      { dueDate: { $gte: from, $lte: `${to}\uffff` } },
      ...(bounds
        ? [{ $and: [undated, { createdAt: { $gte: bounds.start, $lt: bounds.endExclusive } }] }]
        : []),
    ],
  };
};

const searchArtifacts = async (
  context: Context,
  kind: "task" | "note",
): Promise<SearchResultItem[]> => {
  const fields = kind === "task" ? ["title", "description", "body"] : ["title", "body", "content"];
  const and: Record<string, any>[] = [notDeleted];
  const text = textFilter(context.query.terms, fields, context.mode);
  if (text) {
    and.push(text);
  }

  if (kind === "task") {
    const dateFilter = taskDateFilter(context);
    if (dateFilter) {
      and.push(dateFilter);
    }
    if (context.query.status === "done") {
      and.push({ $or: [{ operation: "DONE" }, { status: { $in: ["completed", "DONE", "done"] } }] });
    } else if (context.query.status === "open" || context.query.status === "overdue") {
      and.push({ operation: { $ne: "DONE" }, status: { $nin: ["completed", "DONE", "done"] } });
      if (context.query.status === "overdue") {
        and.push({ dueDate: { $gte: "1970-01-01", $lt: context.todayKey } });
      }
    }
    if (context.query.priority) {
      and.push({ priority: { $regex: `^${context.query.priority}`, $options: "i" } });
    }
  } else if (context.bounds) {
    and.push({ createdAt: { $gte: context.bounds.start, $lt: context.bounds.endExclusive } });
  }

  const filter = { userId: idFilter(context.userId), $and: and };
  const projection = {
    title: 1,
    description: 1,
    body: 1,
    content: 1,
    spaceId: 1,
    sourceConversationId: 1,
    conversationId: 1,
    operation: 1,
    status: 1,
    priority: 1,
    dueDate: 1,
    fingerprint: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const db = mongoose.connection;
  const [publishedName, stagedName] = kind === "task" ? ["tasks", "stagedTasks"] : ["notes", "stagedNotes"];
  const [published, staged] = await Promise.all(
    [publishedName, stagedName].map((name) =>
      db
        .collection(name)
        .find(filter)
        .project(projection)
        .sort({ _id: -1 })
        .limit(CANDIDATES_PER_TYPE)
        .toArray(),
    ),
  );

  // Staged rows are mirrored into the main collection by fingerprint (or same _id);
  // resolve them to the published id so results dedupe and open the listed item.
  const fingerprintKey = (doc: Record<string, any>) =>
    typeof doc.fingerprint === "string" && doc.fingerprint.trim()
      ? `${doc.fingerprint}|${String(doc.spaceId ?? "")}`
      : null;
  const stagedFingerprints = staged
    .map((doc) => (fingerprintKey(doc) ? String(doc.fingerprint) : null))
    .filter((value): value is string => value !== null);
  const publishedByFingerprint = new Map<string, { id: string; deleted: boolean }>();
  if (stagedFingerprints.length > 0) {
    const counterparts = await db
      .collection(publishedName)
      .find({ userId: idFilter(context.userId), fingerprint: { $in: stagedFingerprints } })
      .project({ fingerprint: 1, spaceId: 1, deletedAt: 1 })
      .toArray();
    for (const doc of counterparts) {
      const key = fingerprintKey(doc);
      if (key) {
        publishedByFingerprint.set(key, { id: String(doc._id), deleted: Boolean(doc.deletedAt) });
      }
    }
  }

  const seen = new Set<string>();
  const seenContent = new Set<string>();
  const results: SearchResultItem[] = [];
  const candidates = [
    ...published.map((doc) => ({ doc, staged: false })),
    ...staged.map((doc) => ({ doc, staged: true })),
  ];
  for (const { doc, staged: isStaged } of candidates) {
    let id = String(doc._id);
    if (isStaged) {
      const key = fingerprintKey(doc);
      const counterpart = key ? publishedByFingerprint.get(key) : undefined;
      if (counterpart?.deleted) {
        continue;
      }
      if (counterpart) {
        id = counterpart.id;
      }
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const space = spaceRef(context, doc.spaceId);
    const meetingRaw = doc.sourceConversationId ?? doc.conversationId ?? null;
    const meetingId = meetingRaw ? String(meetingRaw) : null;
    if (space.orphaned && !meetingId) {
      continue;
    }

    const body = asText(doc.description) || asText(doc.body) || asText(doc.content);
    const title = asText(doc.title).trim() || buildSnippet(body, [], 60) || `Untitled ${kind}`;
    const contentKey = `${title.toLowerCase()}|${space.spaceId ?? ""}|${meetingId ?? ""}`;
    if (seenContent.has(contentKey)) {
      continue;
    }
    seenContent.add(contentKey);
    const dueDate = kind === "task" && asText(doc.dueDate) ? asText(doc.dueDate).slice(0, 10) : null;
    const timeMinutes = minutesOfDay(doc.createdAt, context.timeZone);
    const timeBonus =
      context.query.timeMinutes !== null && withinTimeWindow(timeMinutes, context.query.timeMinutes) ? 4 : 0;
    const done = kind === "task" ? isDoneTask(doc) : false;
    const score = scoreItem(context, title, body, dueDate ?? doc.createdAt, timeBonus - (done ? 1 : 0));
    if (score === null) {
      continue;
    }

    results.push({
      type: kind,
      id,
      title,
      snippet: buildSnippet(body, context.query.terms),
      spaceId: space.spaceId,
      spaceName: space.spaceName,
      meetingId,
      date: dueDate ?? asIso(doc.createdAt),
      dateKind: dueDate ? "due" : "created",
      timeLabel: null,
      status: kind === "task" ? (done ? "done" : dueDate && dueDate < context.todayKey ? "overdue" : "open") : null,
      priority: kind === "task" && asText(doc.priority) ? asText(doc.priority).toLowerCase() : null,
      score,
    });
  }
  return results;
};

const summaryText = (doc: Record<string, any> | undefined) => {
  if (!doc) {
    return "";
  }
  const lists = ["topics", "decisions", "importantFacts"]
    .flatMap((key) => (Array.isArray(doc[key]) ? doc[key].map(String) : []))
    .join(" · ");
  return [asText(doc.summary), lists].filter(Boolean).join(" ");
};

const searchMeetings = async (context: Context): Promise<SearchResultItem[]> => {
  const filter: Record<string, any> = { userId: idFilter(context.userId) };
  if (context.bounds) {
    filter.startedAt = { $gte: context.bounds.start, $lt: context.bounds.endExclusive };
  }
  const meetings = await mongoose.connection
    .collection("meeting_sessions")
    .find(filter)
    .project({ meetingTitle: 1, meetingUrl: 1, provider: 1, startedAt: 1, durationMs: 1, spaceId: 1, status: 1 })
    .sort({ _id: -1 })
    .limit(MEETING_CANDIDATES)
    .toArray();

  if (meetings.length === 0) {
    return [];
  }

  const summaries = new Map<string, Record<string, any>>();
  if (context.query.terms.length > 0) {
    const ids = meetings.flatMap((meeting) => [meeting._id, String(meeting._id)]);
    const summaryDocs = await mongoose.connection
      .collection("conversation_summaries")
      .find({ conversationId: { $in: ids } })
      .project({ conversationId: 1, summary: 1, topics: 1, decisions: 1, importantFacts: 1 })
      .toArray();
    for (const doc of summaryDocs) {
      summaries.set(String(doc.conversationId), doc);
    }
  }

  return meetings.flatMap((meeting) => {
    const id = String(meeting._id);
    const minutes = minutesOfDay(meeting.startedAt, context.timeZone);
    if (!withinTimeWindow(minutes, context.query.timeMinutes)) {
      return [];
    }
    const title = asText(meeting.meetingTitle).trim() || "Untitled meeting";
    const body = summaryText(summaries.get(id));
    const score = scoreItem(context, title, `${body} ${asText(meeting.provider)}`, meeting.startedAt);
    if (score === null) {
      return [];
    }
    const space = spaceRef(context, meeting.spaceId);
    return [{
      type: "meeting" as const,
      id,
      title,
      snippet: buildSnippet(body, context.query.terms),
      spaceId: space.spaceId,
      spaceName: space.spaceName,
      meetingId: id,
      date: asIso(meeting.startedAt),
      dateKind: "started" as const,
      timeLabel: minutes === null ? null : formatMinutesLabel(minutes),
      status: asText(meeting.status) || null,
      priority: null,
      score,
    }];
  });
};

const searchEvents = async (context: Context): Promise<SearchResultItem[]> => {
  const filter: Record<string, any> = { userId: idFilter(context.userId) };
  const text = textFilter(context.query.terms, ["title", "description", "location"], context.mode);
  if (text) {
    Object.assign(filter, text);
  }
  if (context.query.dateRange) {
    filter.dateKey = { $gte: context.query.dateRange.from, $lte: context.query.dateRange.to };
  }
  const docs = await mongoose.connection
    .collection("calendar_events")
    .find(filter)
    .project({ title: 1, description: 1, location: 1, dateKey: 1, startTimeLabel: 1, endTimeLabel: 1 })
    .sort({ dateKey: -1 })
    .limit(CANDIDATES_PER_TYPE)
    .toArray();

  return docs.flatMap((doc) => {
    const startLabel = asText(doc.startTimeLabel);
    if (!withinTimeWindow(labelToMinutes(startLabel), context.query.timeMinutes)) {
      return [];
    }
    const title = asText(doc.title) || "Untitled event";
    const body = [asText(doc.description), asText(doc.location)].filter(Boolean).join(" · ");
    const score = scoreItem(context, title, body, doc.dateKey);
    if (score === null) {
      return [];
    }
    const endLabel = asText(doc.endTimeLabel);
    return [{
      type: "event" as const,
      id: String(doc._id),
      title,
      snippet: buildSnippet(body, context.query.terms),
      spaceId: null,
      spaceName: null,
      meetingId: null,
      date: asText(doc.dateKey) || null,
      dateKind: "scheduled" as const,
      timeLabel: startLabel ? (endLabel ? `${startLabel} – ${endLabel}` : startLabel) : null,
      status: null,
      priority: null,
      score,
    }];
  });
};

const loadSpaceNames = async (userId: string) => {
  const docs = await CreateSpace.collection
    .find({ userId: idFilter(userId), deletedAt: null })
    .project({ spacename: 1 })
    .toArray();
  return new Map(docs.map((doc) => [String(doc._id), asText(doc.spacename) || "Untitled space"]));
};

const runSearch = async (context: Context, types: SearchType[]) => {
  const searches: Record<SearchType, () => Promise<SearchResultItem[]>> = {
    space: () => searchSpaces(context),
    task: () => searchArtifacts(context, "task"),
    note: () => searchArtifacts(context, "note"),
    meeting: () => searchMeetings(context),
    event: () => searchEvents(context),
  };
  const groups = await Promise.all(types.map((type) => searches[type]()));
  return groups.flat();
};

export const searchWorkspaceServices = async ({
  userId,
  q,
  limit,
  types: requestedTypes,
  timeZone: requestedTimeZone,
}: {
  userId: string;
  q: string;
  limit?: number;
  types?: SearchType[];
  timeZone?: string;
}) => {
  const timeZone = isValidTimeZone(requestedTimeZone) ? requestedTimeZone! : DEFAULT_REMINDER_TIMEZONE;
  const now = new Date();
  const query = parseSearchQuery(q, { now, timeZone });
  const types = query.types.length > 0
    ? query.types
    : requestedTypes && requestedTypes.length > 0
      ? requestedTypes
      : [...SEARCH_TYPES];
  const perType = Math.min(Math.max(limit ?? (types.length === 1 ? 20 : DEFAULT_LIMIT), 1), MAX_LIMIT);

  const context: Context = {
    userId,
    query,
    mode: "all",
    timeZone,
    now,
    todayKey: dateKeyInTimeZone(now, timeZone) ?? now.toISOString().slice(0, 10),
    bounds: rangeBoundsUtc(query, timeZone),
    spaceNames: await loadSpaceNames(userId),
  };

  let items = await runSearch(context, types);
  let matchMode: "all" | "any" = "all";
  if (items.length === 0 && query.terms.length > 1) {
    matchMode = "any";
    items = await runSearch({ ...context, mode: "any" }, types);
  }

  const byType = new Map<SearchType, SearchResultItem[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }

  const groups = [...byType.entries()]
    .map(([type, list]) => {
      const sorted = list.sort((a, b) => b.score - a.score);
      return { type, total: sorted.length, items: sorted.slice(0, perType) };
    })
    .sort((a, b) => (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0));

  return {
    status: STATUS_CODE.OK,
    data: {
      query: {
        raw: query.raw,
        terms: query.terms,
        types: query.types,
        dateRange: query.dateRange,
        timeLabel: query.timeLabel,
        status: query.status,
        priority: query.priority,
      },
      matchMode,
      total: groups.reduce((sum, group) => sum + group.total, 0),
      groups,
    },
  };
};

const isValidTimeZone = (value: string | undefined) => {
  if (!value) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
