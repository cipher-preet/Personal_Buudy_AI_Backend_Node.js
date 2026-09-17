import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { CalendarEvent } from "../Modals/CalendarEvent.Modal.js";
import { CreateSpace } from "../Modals/Home.Modal.js";
import { Reminder } from "../Modals/Reminder.Modal.js";
import { StagedNotes, StagedTasks } from "../Modals/Staged.Modal.js";
import { DEFAULT_REMINDER_TIMEZONE } from "../reminderSchedule/constants.js";
import {
  dateKeyInTimeZone,
  zonedLocalToUtc,
} from "../reminderSchedule/time.js";

const MAX_RANGE_DAYS = 62;
const MAX_ITEMS_PER_SOURCE = 500;
const TIMELINE_PAD_HOURS = 2;
const TONES = ["indigo", "violet", "cyan", "teal"] as const;

const EVENT_FIELDS =
  "title description location dateKey dateLabel startTimeLabel endTimeLabel tone aiReminder aiCalling notification beeping remindBeforeMinutes reminderId createdAt updatedAt";
const REMINDER_FIELDS =
  "title description dateKey dateLabel timeLabel source tone repeat aiCalling notification beeping createdAt updatedAt";
const TASK_FIELDS =
  "title description body status priority dueDate spaceId createdAt updatedAt";
const NOTE_FIELDS = "title body spaceId createdAt updatedAt";

export type CalendarFeedKind =
  | "meeting"
  | "task"
  | "note"
  | "reminder"
  | "other";

export type CalendarFeedItem = {
  id: string;
  source: "calendar_event" | "reminder" | "task" | "note" | "conversation";
  kind: CalendarFeedKind;
  title: string;
  description: string;
  dateKey: string;
  startTimeLabel: string | null;
  endTimeLabel: string | null;
  location?: string;
  spaceId: string | null;
  spaceName: string | null;
  priority: string | null;
  done: boolean;
  tone?: string;
  aiReminder?: boolean;
  remindBeforeMinutes?: number;
  reminderId?: string | null;
};

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

const mergeDocsById = (
  ...groups: Array<Array<Record<string, any>>>
): Array<Record<string, any>> => {
  const byId = new Map<string, Record<string, any>>();
  for (const group of groups) {
    for (const doc of group) {
      const id = String(doc._id);
      if (!byId.has(id)) {
        byId.set(id, doc);
      }
    }
  }
  return Array.from(byId.values());
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const daysBetweenInclusive = (from: string, to: string) => {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.floor((end - start) / 86400000) + 1;
};

const hoursFromTimeLabel = (label: string | null | undefined) => {
  if (!label) {
    return null;
  }
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour < 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return hour + minute / 60;
};

const buildDayWindows = (items: CalendarFeedItem[]) => {
  const byDay = new Map<string, { earliest: number; latest: number }>();

  for (const item of items) {
    const start = hoursFromTimeLabel(item.startTimeLabel);
    if (start == null) {
      continue;
    }
    let end = hoursFromTimeLabel(item.endTimeLabel);
    if (end == null || end <= start) {
      end = start + 1;
    }

    const current = byDay.get(item.dateKey);
    if (!current) {
      byDay.set(item.dateKey, { earliest: start, latest: end });
      continue;
    }
    current.earliest = Math.min(current.earliest, start);
    current.latest = Math.max(current.latest, end);
  }

  const windows: Record<string, { startHour: number; endHour: number }> = {};
  for (const [dateKey, { earliest, latest }] of byDay) {
    const startHour = Math.max(0, Math.floor(earliest) - TIMELINE_PAD_HOURS);
    const endHour = Math.min(
      24,
      Math.max(startHour + 1, Math.ceil(latest) + TIMELINE_PAD_HOURS),
    );
    windows[dateKey] = { startHour, endHour };
  }
  return windows;
};

const buildSummaryByDate = (items: CalendarFeedItem[]) => {
  const summary: Record<
    string,
    {
      meetings: number;
      tasks: number;
      notes: number;
      reminders: number;
      total: number;
    }
  > = {};

  for (const item of items) {
    const bucket = summary[item.dateKey] ?? {
      meetings: 0,
      tasks: 0,
      notes: 0,
      reminders: 0,
      total: 0,
    };

    if (item.kind === "meeting") {
      bucket.meetings += 1;
    } else if (item.kind === "task") {
      bucket.tasks += 1;
    } else if (item.kind === "note") {
      bucket.notes += 1;
    } else if (item.kind === "reminder") {
      bucket.reminders += 1;
    }

    bucket.total =
      bucket.meetings + bucket.tasks + bucket.notes + bucket.reminders;
    summary[item.dateKey] = bucket;
  }

  return summary;
};

const mapEventItem = (event: Record<string, any>): CalendarFeedItem => ({
  id: String(event._id),
  source: "calendar_event",
  kind: "meeting",
  title: event.title ?? "",
  description: event.description ?? "",
  dateKey: event.dateKey ?? "",
  startTimeLabel: event.startTimeLabel ?? null,
  endTimeLabel: event.endTimeLabel ?? null,
  location: event.location ?? "",
  spaceId: null,
  spaceName: null,
  priority: null,
  done: false,
  tone: TONES.includes(event.tone) ? event.tone : "indigo",
  aiReminder: Boolean(event.aiReminder),
  remindBeforeMinutes: Math.max(
    0,
    Math.min(1440, Number(event.remindBeforeMinutes) || 0),
  ),
  reminderId: event.reminderId ? String(event.reminderId) : null,
});

const mapReminderItem = (reminder: Record<string, any>): CalendarFeedItem => ({
  id: String(reminder._id),
  source: "reminder",
  kind: "reminder",
  title: reminder.title ?? "",
  description: reminder.description ?? "",
  dateKey: reminder.dateKey ?? "",
  startTimeLabel: reminder.timeLabel ?? null,
  endTimeLabel: null,
  spaceId: null,
  spaceName: null,
  priority: null,
  done: false,
  tone: reminder.tone ?? "lavender",
});

const mapTaskItem = (
  task: Record<string, any>,
  spaceNames: Map<string, string>,
): CalendarFeedItem | null => {
  const dateKey =
    typeof task.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
      ? task.dueDate
      : null;
  if (!dateKey) {
    return null;
  }

  const description =
    typeof task.description === "string"
      ? task.description
      : typeof task.body === "string"
        ? task.body
        : "";
  const spaceId = task.spaceId ? String(task.spaceId) : null;
  const status = String(task.status || task.operation || "").toLowerCase();

  return {
    id: String(task._id),
    source: "task",
    kind: "task",
    title: task.title ?? "Task",
    description: description.trim().slice(0, 280),
    dateKey,
    startTimeLabel: null,
    endTimeLabel: null,
    spaceId,
    spaceName: spaceId ? spaceNames.get(spaceId) ?? null : null,
    priority: task.priority ? String(task.priority) : null,
    done: status === "done" || status === "completed",
  };
};

const mapNoteItem = (
  note: Record<string, any>,
  spaceNames: Map<string, string>,
  timeZone: string,
): CalendarFeedItem | null => {
  const createdAt = note.createdAt ? new Date(note.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const dateKey = dateKeyInTimeZone(createdAt, timeZone);
  if (!dateKey) {
    return null;
  }

  const body = typeof note.body === "string" ? note.body.trim() : "";
  const spaceId = note.spaceId ? String(note.spaceId) : null;

  return {
    id: String(note._id),
    source: "note",
    kind: "note",
    title: note.title ?? "Note",
    description: body.slice(0, 280),
    dateKey,
    startTimeLabel: null,
    endTimeLabel: null,
    spaceId,
    spaceName: spaceId ? spaceNames.get(spaceId) ?? null : null,
    priority: null,
    done: false,
  };
};

const formatTimeLabelFromDate = (date: Date, timeZone: string) => {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const hour = parts.hour;
    const minute = parts.minute;
    const dayPeriod = (parts.dayPeriod || "AM").toUpperCase();
    if (!hour || !minute) {
      return null;
    }
    return `${hour}:${minute} ${dayPeriod}`;
  } catch {
    return null;
  }
};

const mapConversationItem = (
  conversation: Record<string, any>,
  spaceNames: Map<string, string>,
  timeZone: string,
): CalendarFeedItem | null => {
  const startedAtRaw =
    conversation.startedAt || conversation.createdAt || conversation.updatedAt;
  const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    return null;
  }

  const dateKey = dateKeyInTimeZone(startedAt, timeZone);
  if (!dateKey) {
    return null;
  }

  const spaceId = conversation.spaceId ? String(conversation.spaceId) : null;
  const title =
    conversation.title ||
    conversation.spaceName ||
    (spaceId ? spaceNames.get(spaceId) : null) ||
    "Recorded conversation";

  const startTimeLabel = formatTimeLabelFromDate(startedAt, timeZone);
  let endTimeLabel: string | null = null;
  const endedAtRaw = conversation.endedAt || conversation.completedAt;
  if (endedAtRaw) {
    const endedAt = new Date(endedAtRaw);
    if (!Number.isNaN(endedAt.getTime())) {
      endTimeLabel = formatTimeLabelFromDate(endedAt, timeZone);
    }
  }

  return {
    id: String(conversation._id),
    source: "conversation",
    kind: "meeting",
    title: String(title),
    description: String(conversation.summary || conversation.status || "").slice(
      0,
      280,
    ),
    dateKey,
    startTimeLabel,
    endTimeLabel,
    spaceId,
    spaceName: spaceId ? spaceNames.get(spaceId) ?? null : null,
    priority: null,
    done: false,
    tone: "indigo",
  };
};

const rangeBoundsUtc = (from: string, to: string, timeZone: string) => {
  const start = zonedLocalToUtc(from, "12:00 AM", timeZone);
  const endExclusive = zonedLocalToUtc(
    addDaysToDateKey(to, 1),
    "12:00 AM",
    timeZone,
  );
  if (!start || !endExclusive) {
    return null;
  }
  return { start, endExclusive };
};

export const getCalendarFeedRepository = async (
  userId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    if (!userId?.trim()) {
      return {
        status: STATUS_CODE.UNAUTHORIZED,
        message: "Unauthorized",
      };
    }

    const span = daysBetweenInclusive(fromDate, toDate);
    if (span == null) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid date range.",
      };
    }
    if (span > MAX_RANGE_DAYS) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: `Date range cannot exceed ${MAX_RANGE_DAYS} days.`,
      };
    }

    // Always scope every collection to the authenticated user only.
    const ownerId = userId.trim();
    const userFilter = { userId: createIdFilter(ownerId) };
    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };
    const timeZone = DEFAULT_REMINDER_TIMEZONE;
    const bounds = rangeBoundsUtc(fromDate, toDate, timeZone);
    const db = mongoose.connection;

    const spacesPromise = CreateSpace.find({
      ...userFilter,
      ...notDeleted,
    })
      .select("spacename")
      .lean();

    const eventsPromise = CalendarEvent.find({
      ...userFilter,
      dateKey: { $gte: fromDate, $lte: toDate },
    })
      .select(EVENT_FIELDS)
      .sort({ dateKey: 1, startTimeLabel: 1, _id: 1 })
      .limit(MAX_ITEMS_PER_SOURCE)
      .lean();

    const remindersPromise = Reminder.find({
      ...userFilter,
      dateKey: { $gte: fromDate, $lte: toDate },
    })
      .select(REMINDER_FIELDS)
      .sort({ dateKey: 1, timeLabel: 1, _id: 1 })
      .limit(MAX_ITEMS_PER_SOURCE)
      .lean();

    const taskQuery = {
      ...userFilter,
      ...notDeleted,
      dueDate: { $gte: fromDate, $lte: toDate },
    };

    const tasksPromise = Promise.all([
      StagedTasks.find(taskQuery)
        .select(TASK_FIELDS)
        .sort({ dueDate: 1, _id: 1 })
        .limit(MAX_ITEMS_PER_SOURCE)
        .lean(),
      db
        .collection("tasks")
        .find(taskQuery)
        .project({
          title: 1,
          description: 1,
          body: 1,
          status: 1,
          priority: 1,
          dueDate: 1,
          spaceId: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ dueDate: 1, _id: 1 })
        .limit(MAX_ITEMS_PER_SOURCE)
        .toArray()
        .catch(() => []),
    ]).then(([staged, published]) => mergeDocsById(staged, published));

    const noteQuery = bounds
      ? {
          ...userFilter,
          ...notDeleted,
          createdAt: { $gte: bounds.start, $lt: bounds.endExclusive },
        }
      : null;

    const notesPromise = noteQuery
      ? Promise.all([
          StagedNotes.find(noteQuery)
            .select(NOTE_FIELDS)
            .sort({ createdAt: 1, _id: 1 })
            .limit(MAX_ITEMS_PER_SOURCE)
            .lean(),
          db
            .collection("notes")
            .find(noteQuery)
            .project({
              title: 1,
              body: 1,
              spaceId: 1,
              createdAt: 1,
              updatedAt: 1,
            })
            .sort({ createdAt: 1, _id: 1 })
            .limit(MAX_ITEMS_PER_SOURCE)
            .toArray()
            .catch(() => []),
        ]).then(([staged, published]) => mergeDocsById(staged, published))
      : Promise.resolve([]);

    const conversationsPromise = bounds
      ? db
          .collection("conversations")
          .find({
            ...userFilter,
            $or: [
              { startedAt: { $gte: bounds.start, $lt: bounds.endExclusive } },
              {
                startedAt: { $exists: false },
                createdAt: { $gte: bounds.start, $lt: bounds.endExclusive },
              },
            ],
          })
          .project({
            title: 1,
            spaceId: 1,
            spaceName: 1,
            status: 1,
            summary: 1,
            startedAt: 1,
            endedAt: 1,
            completedAt: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .sort({ startedAt: 1, createdAt: 1 })
          .limit(MAX_ITEMS_PER_SOURCE)
          .toArray()
      : Promise.resolve([]);

    const [spaces, events, reminders, tasks, notes, conversations] =
      await Promise.all([
        spacesPromise,
        eventsPromise,
        remindersPromise,
        tasksPromise,
        notesPromise,
        conversationsPromise,
      ]);

    const spaceNames = new Map<string, string>();
    for (const space of spaces) {
      spaceNames.set(String(space._id), space.spacename || "Space");
    }

    // Avoid showing the same reminder twice when it was created from a calendar event.
    const linkedReminderIds = new Set(
      events
        .map((event) => (event.reminderId ? String(event.reminderId) : null))
        .filter((id): id is string => Boolean(id)),
    );
    const standaloneReminders = reminders.filter(
      (reminder) => !linkedReminderIds.has(String(reminder._id)),
    );

    const items: CalendarFeedItem[] = [
      ...events.map(mapEventItem),
      ...standaloneReminders.map(mapReminderItem),
      ...tasks
        .map((task) => mapTaskItem(task, spaceNames))
        .filter((item): item is CalendarFeedItem => Boolean(item)),
      ...notes
        .map((note) => mapNoteItem(note, spaceNames, timeZone))
        .filter((item): item is CalendarFeedItem => Boolean(item)),
      ...conversations
        .map((conversation) =>
          mapConversationItem(conversation, spaceNames, timeZone),
        )
        .filter((item): item is CalendarFeedItem => Boolean(item)),
    ].filter((item) => item.dateKey >= fromDate && item.dateKey <= toDate);

    items.sort((left, right) => {
      if (left.dateKey !== right.dateKey) {
        return left.dateKey.localeCompare(right.dateKey);
      }
      const leftStart = hoursFromTimeLabel(left.startTimeLabel) ?? 99;
      const rightStart = hoursFromTimeLabel(right.startTimeLabel) ?? 99;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }
      return left.title.localeCompare(right.title);
    });

    const usedSpaceIds = new Set(
      items
        .map((item) => item.spaceId)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      status: STATUS_CODE.OK,
      data: {
        from: fromDate,
        to: toDate,
        userId: ownerId,
        items,
        spaces: spaces
          .filter((space) => usedSpaceIds.has(String(space._id)))
          .map((space) => ({
            id: String(space._id),
            name: space.spacename || "Space",
          })),
        summaryByDate: buildSummaryByDate(items),
        windows: buildDayWindows(items),
        counts: {
          meetings: items.filter((item) => item.kind === "meeting").length,
          tasks: items.filter((item) => item.kind === "task").length,
          notes: items.filter((item) => item.kind === "note").length,
          reminders: items.filter((item) => item.kind === "reminder").length,
          total: items.length,
        },
      },
    };
  } catch (error) {
    console.log("error in CalendarFeed repository Layer ", error);
    throw error;
  }
};
