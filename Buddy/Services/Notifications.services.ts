import mongoose from "mongoose";
import { NotificationState } from "../Modals/NotificationState.Modal.js";

export type NotificationType = "task" | "note" | "meeting";

export type NotificationItem = {
  /** Stable key, `<type>:<entityId>` of the newest item in the group. */
  id: string;
  /** Keys of every item folded into this notification; mark these to mark it read. */
  memberIds: string[];
  count: number;
  type: NotificationType;
  entityId: string;
  title: string;
  message: string;
  /** For grouped notifications, the first few item titles. */
  preview: string | null;
  spaceId: string | null;
  spaceName: string | null;
  meetingId: string | null;
  createdAt: string;
  read: boolean;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
};

const WINDOW_DAYS = 30;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 30;
/** Raw rows scanned per collection; grouping folds them into far fewer notifications. */
const SCAN_LIMIT = 200;
const MAX_READ_KEYS = 1000;
/** One extraction run writes its tasks/notes within moments of each other. */
const GROUP_WINDOW_MS = 10 * 60_000;
const KEY_PATTERN = /^(task|note|meeting):[a-f0-9]{24}$/;

const notDeleted = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

const ownerFilter = (userId: string) => ({
  $in: [userId, new mongoose.Types.ObjectId(userId)],
});

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asDate = (value: unknown) => {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const getOrCreateState = async (userId: string) => {
  // New users start with everything already read; only items created afterwards are unread.
  const state = await NotificationState.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, lastReadAllAt: new Date(), readKeys: [] } },
    { upsert: true, returnDocument: "after" },
  ).lean<{ lastReadAllAt: Date; readKeys?: string[] }>();

  return {
    lastReadAllAt: asDate(state?.lastReadAllAt) ?? new Date(),
    readKeys: new Set(state?.readKeys ?? []),
  };
};

/**
 * When the item actually appeared. Manually created rows get a real Node ObjectId,
 * while AI-extracted rows use hash-derived ids whose timestamp is meaningless.
 */
const EARLIEST_PLAUSIBLE_ID = Date.UTC(2024, 0, 1);

export const insertedAt = (doc: Record<string, any>) => {
  const fromMeeting = Boolean(doc.conversationId ?? doc.sourceConversationId);
  if (doc.source === "manual" && !fromMeeting && typeof doc._id?.getTimestamp === "function") {
    const idTime: Date = doc._id.getTimestamp();
    if (idTime.getTime() >= EARLIEST_PLAUSIBLE_ID && idTime.getTime() <= Date.now() + 5 * 60_000) {
      return idTime;
    }
  }
  return asDate(doc.createdAt) ?? new Date(0);
};

type RawItem = {
  type: NotificationType;
  doc: Record<string, any>;
  createdAt: Date;
};

const loadRecent = async (userId: string, since: Date, limit: number): Promise<RawItem[]> => {
  const db = mongoose.connection.db;
  if (!db) {
    return [];
  }

  const owner = ownerFilter(userId);
  const createdFilter = { createdAt: { $gte: since } };
  // Manual notes store the user-picked date as createdAt, so match them by insert time too.
  const itemFilter = {
    userId: owner,
    $and: [
      notDeleted,
      {
        $or: [
          createdFilter,
          { source: "manual", _id: { $gte: mongoose.Types.ObjectId.createFromTime(Math.floor(since.getTime() / 1000)) } },
        ],
      },
    ],
  };
  const itemProjection = {
    title: 1,
    spaceId: 1,
    conversationId: 1,
    sourceConversationId: 1,
    source: 1,
    createdAt: 1,
  };

  const [tasks, notes, meetings] = await Promise.all([
    db.collection("tasks").find(itemFilter).project(itemProjection).sort({ createdAt: -1 }).limit(limit).toArray(),
    db.collection("notes").find(itemFilter).project(itemProjection).sort({ createdAt: -1 }).limit(limit).toArray(),
    db
      .collection("meeting_sessions")
      .find({ userId: owner, ...createdFilter })
      .project({ meetingTitle: 1, provider: 1, spaceId: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
  ]);

  const toRaw = (type: NotificationType) => (doc: Record<string, any>) => ({
    type,
    doc,
    createdAt: insertedAt(doc),
  });

  return [...tasks.map(toRaw("task")), ...notes.map(toRaw("note")), ...meetings.map(toRaw("meeting"))]
    .filter((item) => item.createdAt >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

const keyOf = (item: RawItem) => `${item.type}:${String(item.doc._id)}`;

const conversationOf = (item: RawItem) => {
  if (item.type === "meeting") {
    return null;
  }
  const id = item.doc.conversationId ?? item.doc.sourceConversationId;
  return id ? String(id) : null;
};

type RawGroup = { lead: RawItem; members: RawItem[] };

/** Folds tasks/notes extracted from the same conversation at the same time. Input is newest first. */
export const groupItems = (items: RawItem[]): RawGroup[] => {
  const groups: RawGroup[] = [];
  const open = new Map<string, RawGroup>();

  for (const item of items) {
    const conversationId = conversationOf(item);
    const groupKey = conversationId ? `${item.type}:${conversationId}` : null;
    const existing = groupKey ? open.get(groupKey) : undefined;

    if (existing && existing.lead.createdAt.getTime() - item.createdAt.getTime() <= GROUP_WINDOW_MS) {
      existing.members.push(item);
      continue;
    }

    const group = { lead: item, members: [item] };
    groups.push(group);
    if (groupKey) {
      open.set(groupKey, group);
    }
  }

  return groups;
};

const PROVIDER_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

const describe = (group: RawGroup, fromMeeting: boolean) => {
  const { lead, members } = group;
  const count = members.length;

  if (lead.type === "meeting") {
    const provider = PROVIDER_LABELS[asText(lead.doc.provider)];
    return {
      title: asText(lead.doc.meetingTitle) || "Untitled meeting",
      message: provider ? `New ${provider} meeting recorded` : "New meeting recorded",
      preview: null,
    };
  }

  const noun = lead.type === "task" ? "task" : "note";
  const titleOf = (item: RawItem) => asText(item.doc.title) || `Untitled ${noun}`;

  if (count === 1) {
    return {
      title: titleOf(lead),
      message: fromMeeting ? `New ${noun} from a meeting` : `New ${noun} added`,
      preview: null,
    };
  }

  const shown = members.slice(0, 3).map(titleOf);
  return {
    title: `${count} new ${noun}s`,
    message: fromMeeting ? `Extracted from a meeting` : `Added together`,
    preview: count > shown.length ? `${shown.join(" · ")} · +${count - shown.length} more` : shown.join(" · "),
  };
};

export const getNotificationFeed = async (
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationFeed> => {
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const state = await getOrCreateState(userId);
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const isUnreadItem = (item: RawItem) =>
    item.createdAt > state.lastReadAllAt && !state.readKeys.has(keyOf(item));

  const groups = groupItems(await loadRecent(userId, windowStart, SCAN_LIMIT));
  // A group is unread while any of its items is.
  const unreadGroups = groups.filter((group) => group.members.some(isUnreadItem));
  const selected = (options.unreadOnly ? unreadGroups : groups).slice(0, limit);

  const db = mongoose.connection.db;
  const spaceIds = [
    ...new Set(selected.map((group) => group.lead.doc.spaceId).filter(Boolean).map(String)),
  ].filter((id) => mongoose.isValidObjectId(id));
  const conversationIds = [
    ...new Set(selected.map((group) => conversationOf(group.lead)).filter((id): id is string => Boolean(id))),
  ].filter((id) => mongoose.isValidObjectId(id));

  const [spaces, meetingSessions] = db
    ? await Promise.all([
        spaceIds.length
          ? db
              .collection("spaces")
              .find({
                _id: { $in: spaceIds.map((id) => new mongoose.Types.ObjectId(id)) },
                userId: ownerFilter(userId),
                ...notDeleted,
              })
              .project({ spacename: 1 })
              .toArray()
          : Promise.resolve([]),
        conversationIds.length
          ? db
              .collection("meeting_sessions")
              .find({ _id: { $in: conversationIds.map((id) => new mongoose.Types.ObjectId(id)) } })
              .project({ _id: 1 })
              .toArray()
          : Promise.resolve([]),
      ])
    : [[], []];

  const spaceNames = new Map(spaces.map((space) => [String(space._id), asText(space.spacename) || "Untitled space"]));
  const meetingIds = new Set(meetingSessions.map((session) => String(session._id)));

  const items = selected.map((group): NotificationItem => {
    const { lead, members } = group;
    const entityId = String(lead.doc._id);
    const rawSpaceId = lead.doc.spaceId ? String(lead.doc.spaceId) : null;
    const spaceName = rawSpaceId ? spaceNames.get(rawSpaceId) ?? null : null;
    const conversationId = conversationOf(lead);
    const meetingId =
      lead.type === "meeting" ? entityId : conversationId && meetingIds.has(conversationId) ? conversationId : null;

    return {
      id: keyOf(lead),
      memberIds: members.map(keyOf),
      count: members.length,
      type: lead.type,
      entityId,
      ...describe(group, Boolean(conversationId)),
      // A space that no longer exists can't be opened.
      spaceId: spaceName ? rawSpaceId : null,
      spaceName,
      meetingId,
      createdAt: lead.createdAt.toISOString(),
      read: !members.some(isUnreadItem),
    };
  });

  return { items, unreadCount: unreadGroups.length };
};

export const markNotificationsRead = async (userId: string, ids: unknown) => {
  const keys = (Array.isArray(ids) ? ids : [])
    .filter((id): id is string => typeof id === "string" && KEY_PATTERN.test(id))
    .slice(0, SCAN_LIMIT);

  if (keys.length === 0) {
    return;
  }

  await getOrCreateState(userId);
  await NotificationState.updateOne(
    { userId },
    { $push: { readKeys: { $each: keys, $slice: -MAX_READ_KEYS } } },
  );
};

export const markAllNotificationsRead = async (userId: string) => {
  await NotificationState.updateOne(
    { userId },
    { $set: { lastReadAllAt: new Date(), readKeys: [] } },
    { upsert: true },
  );
};
