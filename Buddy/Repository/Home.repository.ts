import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { validatePlanLimit, beginListeningUsage, endListeningUsage } from "../../Plans/Services/Plan.services.js";
import { CreateSpace } from "../Modals/Home.Modal.js";
import { StagedNotes, StagedTasks } from "../Modals/Staged.Modal.js";
import { DEFAULT_REMINDER_TIMEZONE } from "../reminderSchedule/constants.js";
import { zonedLocalToUtc } from "../reminderSchedule/time.js";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

const assertCanCreateInSpace = async (
  userId: string,
  spaceId: string,
  resource: "notes" | "tasks",
) => {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(spaceId)) {
    return {
      ok: false as const,
      status: STATUS_CODE.BAD_REQUEST,
      message: "Invalid user or space.",
      data: undefined,
    };
  }

  const [quota, space] = await Promise.all([
    validatePlanLimit(userId, resource),
    CreateSpace.exists({
      _id: spaceId,
      userId: createIdFilter(userId),
      deletedAt: null,
    }),
  ]);

  if (!quota.allowed) {
    return {
      ok: false as const,
      status: quota.status,
      message: quota.message,
      data: quota.data,
    };
  }

  if (!space) {
    return {
      ok: false as const,
      status: STATUS_CODE.NOT_FOUND,
      message: "Space not found.",
      data: undefined,
    };
  }

  return { ok: true as const };
};

const toOwnedObjectId = (id: string) => new mongoose.Types.ObjectId(id);

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDateFromKey = (dateKey?: string) => {
  if (!dateKey || !DATE_KEY_PATTERN.test(dateKey)) {
    return new Date();
  }

  return new Date(`${dateKey}T12:00:00.000Z`);
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const dayBoundsUtc = (
  dateKey: string,
  timeZone = DEFAULT_REMINDER_TIMEZONE,
) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return null;
  }

  const start = zonedLocalToUtc(dateKey, "12:00 AM", timeZone);
  const endExclusive = zonedLocalToUtc(
    addDaysToDateKey(dateKey, 1),
    "12:00 AM",
    timeZone,
  );

  if (!start || !endExclusive) {
    return null;
  }

  return { start, endExclusive };
};

const notDeletedFilter = {
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
};

/**
 * Ensure staged notes/tasks also exist in the official main collections.
 *
 * Only staged docs that were never mirrored (or changed since) are copied, and
 * each one is stamped with `mirroredAt`, so steady-state calls cost a single
 * indexed lookup instead of re-upserting up to 500 docs on every request.
 * Concurrent calls for the same user/space share one in-flight run.
 */
const MIRROR_BATCH_LIMIT = 500;
const inflightMirrors = new Map<string, Promise<void>>();

const pendingMirrorFilter = (userId: string, spaceId: string) => ({
  userId: createIdFilter(userId),
  spaceId: createIdFilter(spaceId),
  $and: [
    notDeletedFilter,
    {
      $or: [
        { mirroredAt: { $exists: false } },
        { mirroredAt: null },
        { $expr: { $gt: ["$updatedAt", "$mirroredAt"] } },
      ],
    },
  ],
});

const runMirror = async (
  kind: "notes" | "tasks",
  userId: string,
  spaceId: string,
  buildSet: (doc: Record<string, any>) => Record<string, any>,
) => {
  const key = `${kind}:${userId}:${spaceId}`;
  const existing = inflightMirrors.get(key);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    try {
      const stagedCollection =
        kind === "notes" ? StagedNotes.collection : StagedTasks.collection;
      const staged = await stagedCollection
        .find(pendingMirrorFilter(userId, spaceId))
        .limit(MIRROR_BATCH_LIMIT)
        .toArray();

      if (!staged.length) {
        return;
      }

      await mongoose.connection.collection(kind).bulkWrite(
        staged.map((doc) => {
          const filter =
            typeof doc.fingerprint === "string" && doc.fingerprint.trim()
              ? {
                  fingerprint: doc.fingerprint,
                  userId: doc.userId,
                  spaceId: doc.spaceId,
                }
              : { _id: doc._id };

          return {
            updateOne: {
              filter,
              update: {
                $set: {
                  ...buildSet(doc),
                  userId: doc.userId,
                  spaceId: doc.spaceId,
                  updatedAt: doc.updatedAt ?? new Date(),
                  deletedAt: null,
                },
                $setOnInsert: {
                  _id: doc._id,
                  createdAt: doc.createdAt ?? new Date(),
                },
              },
              upsert: true,
            },
          };
        }),
        { ordered: false },
      );

      await stagedCollection.bulkWrite(
        staged.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { mirroredAt: doc.updatedAt ?? new Date() } },
          },
        })),
        { ordered: false },
      );
    } catch (error) {
      console.log(`mirror staged ${kind} failed`, error);
    } finally {
      inflightMirrors.delete(key);
    }
  })();

  inflightMirrors.set(key, run);
  return run;
};

const mirrorStagedNotesIntoMain = (userId: string, spaceId: string) =>
  runMirror("notes", userId, spaceId, (doc) => ({
    title: doc.title,
    body: doc.body,
    confidence: doc.confidence ?? null,
    evidence: doc.evidence ?? [],
    origin: doc.origin ?? "explicit",
    source: doc.source ?? "manual",
    ...(doc.conversationId ? { conversationId: doc.conversationId } : {}),
    ...(doc.sourceConversationId
      ? { sourceConversationId: doc.sourceConversationId }
      : {}),
  }));

const mirrorStagedTasksIntoMain = (userId: string, spaceId: string) =>
  runMirror("tasks", userId, spaceId, (doc) => ({
    title: doc.title,
    body: doc.body ?? doc.description ?? "",
    description: doc.description ?? doc.body ?? "",
    evidence: doc.evidence ?? [],
    operation: doc.operation ?? null,
    status: doc.status ?? "pending",
    priority: doc.priority ?? null,
    dueDate: doc.dueDate ?? null,
    confidence: doc.confidence ?? null,
    origin: doc.origin ?? "explicit",
    source: doc.source ?? "manual",
  }));

/**
 * Indexes backing the per-space list, count and marker queries. createIndex is
 * idempotent, so this runs once per process on first use.
 */
let indexesReady: Promise<void> | null = null;
const ensureListIndexes = () => {
  if (!indexesReady) {
    const db = mongoose.connection;
    indexesReady = Promise.all([
      db.collection("notes").createIndex({ userId: 1, spaceId: 1, _id: -1 }),
      db.collection("notes").createIndex({ userId: 1, spaceId: 1, createdAt: -1 }),
      db.collection("tasks").createIndex({ userId: 1, spaceId: 1, _id: -1 }),
      db.collection("tasks").createIndex({ userId: 1, spaceId: 1, createdAt: -1 }),
      StagedNotes.collection.createIndex({ userId: 1, spaceId: 1, mirroredAt: 1 }),
      StagedTasks.collection.createIndex({ userId: 1, spaceId: 1, mirroredAt: 1 }),
      CreateSpace.collection.createIndex({ userId: 1, deletedAt: 1, _id: -1 }),
      CreateSpace.collection.createIndex({ userId: 1, isListning: 1, deletedAt: 1 }),
    ])
      .then(() => undefined)
      .catch((error) => {
        console.log("ensureListIndexes failed", error);
        indexesReady = null;
      });
  }
  return indexesReady;
};

const NOTE_PREVIEW_LENGTH = 140;

const mapNoteListCard = (note: Record<string, any>) => {
  const conversationId = note.conversationId ?? note.sourceConversationId;

  return {
    id: String(note._id),
    title: note.title ?? "",
    bodyPreview: typeof note.bodyPreview === "string" ? note.bodyPreview : "",
    confidence: note.confidence ?? null,
    createdAt: note.createdAt ?? null,
    updatedAt: note.updatedAt ?? null,
    conversationId: conversationId ? String(conversationId) : null,
  };
};

const mapStagedNoteCard = (note: Record<string, any>) => {
  const body = typeof note.body === "string" ? note.body.trim() : "";
  const conversationId = note.conversationId ?? note.sourceConversationId;

  return {
    id: String(note._id),
    title: note.title ?? "",
    body,
    bodyPreview: body.slice(0, 140),
    confidence: note.confidence ?? null,
    createdAt: note.createdAt ?? null,
    updatedAt: note.updatedAt ?? null,
    conversationId: conversationId ? String(conversationId) : null,
  };
};

const mapStagedTaskCard = (task: Record<string, any>) => {
  const description =
    typeof task.description === "string"
      ? task.description
      : typeof task.body === "string"
        ? task.body
        : "";

  return {
    id: String(task._id),
    title: task.title ?? "",
    body: description.trim(),
    descriptionPreview: description.trim().slice(0, 140),
    evidence: task.evidence ?? null,
    operation: task.operation ?? task.status ?? null,
    priority: task.priority ?? null,
    dueDate: task.dueDate ?? null,
    confidence: task.confidence ?? null,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
  };
};

export const createSpaceRepository = async (
  spacename: string,
  userId: string,
) => {
  try {
    const quota = await validatePlanLimit(userId, "spaces");

    if (!quota.allowed) {
      return {
        status: quota.status,
        message: quota.message,
        data: quota.data,
      };
    }

    const createSpace = await CreateSpace.create({
      spacename,
      userId,
    });

    if (!createSpace) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to create space",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Space created successfully",
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------

export type SpaceCountsMode = "all" | "notes" | "tasks" | "none";

export const getUserSpacesByUserIdRepository = async (
  userId: string,
  limit = 10,
  cursor?: string,
  counts: SpaceCountsMode = "all",
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    const query: Record<string, any> = { userId, deletedAt: null };

    if (cursor) {
      if (!mongoose.isValidObjectId(cursor)) {
        return {
          status: STATUS_CODE.BAD_REQUEST,
          message: "Invalid cursor value.",
        };
      }

      query._id = {
        $lt: new mongoose.Types.ObjectId(cursor),
      };
    }

    await ensureListIndexes();

    const spaces = await CreateSpace.find(query)
      .select("-__v")
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean();

    let nextCursor: string | null = null;

    const results = spaces.slice(0, pageSize);

    if (spaces.length > pageSize) {
      nextCursor = String(results[results.length - 1]._id);
    }

    const resultSpaceIds = results.map(space => space._id);
    const resultSpaceIdStrings = resultSpaceIds.map(spaceId => String(spaceId));
    const spaceIdFilter = {
      $in: [...resultSpaceIds, ...resultSpaceIdStrings],
    };
    const countBySpace = async (
      collectionName: "notes" | "tasks",
      enabled: boolean,
    ) => {
      const counts = new Map<string, number>();
      if (!enabled || results.length === 0) {
        return counts;
      }
      const rows = await mongoose.connection
        .collection(collectionName)
        .aggregate<{ _id?: unknown; count?: number }>([
          {
            $match: {
              userId: createIdFilter(userId),
              spaceId: spaceIdFilter,
              ...notDeletedFilter,
            },
          },
          { $group: { _id: "$spaceId", count: { $sum: 1 } } },
        ])
        .toArray()
        .catch(() => []);
      rows.forEach((row) => counts.set(String(row._id), row.count ?? 0));
      return counts;
    };

    const includeNotes = counts === "all" || counts === "notes";
    const includeTasks = counts === "all" || counts === "tasks";
    const [noteCountBySpaceId, taskCountBySpaceId] = await Promise.all([
      countBySpace("notes", includeNotes),
      countBySpace("tasks", includeTasks),
    ]);

    return {
      status: STATUS_CODE.OK,
      message: "User spaces fetched successfully.",
      data: {
        spaces: results.map(space => ({
          ...space,
          ...(includeTasks
            ? { tasksCount: taskCountBySpaceId.get(String(space._id)) ?? 0 }
            : {}),
          ...(includeNotes
            ? { notesCount: noteCountBySpaceId.get(String(space._id)) ?? 0 }
            : {}),
        })),
        nextCursor,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------------

export const getUserActiveSpaceRepository = async (userId: string) => {
  try {
    await ensureListIndexes();

    const response = await CreateSpace.find({
      userId: userId,
      isListning: true,
      deletedAt: null,
    })
      .select("-createdAt -updatedAt -__v")
      .lean();

    return response ?? [];
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const startListningRepository = async (
  spaceId: string,
  isListning: unknown,
) => {
  try {
    if (!spaceId || typeof isListning !== "boolean") {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "spaceId and boolean isListning are required",
      };
    }

    const response = await CreateSpace.findOne({
      _id: spaceId,
      deletedAt: null,
    });

    if (!response) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Error while selecting Space",
      };
    }

    if (isListning) {
      const quota = await beginListeningUsage(
        String(response.userId),
        String(response._id),
      );

      if (!quota.allowed) {
        return {
          status: quota.status,
          message: quota.message,
          data: quota.data,
        };
      }
    } else if (response.userId) {
      await endListeningUsage(String(response.userId));
    }

    const updated = await CreateSpace.findOneAndUpdate(
      {
        _id: spaceId,
        deletedAt: null,
      },
      {
        $set: {
          isListning: isListning,
          listeningStartedAt: isListning ? new Date() : null,
        },
      },
      { new: true },
    );

    if (!updated) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Error while selecting Space",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: isListning ? "Listning start now ..." : "Listning Stops",
      isListning: updated.isListning,
      listeningStartedAt: updated.listeningStartedAt,
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const deleteSpaceRepository = async (
  userId: string,
  spaceId: string,
) => {
  try {
    if (!mongoose.isValidObjectId(spaceId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'spaceId' value.",
      };
    }

    const response = await CreateSpace.findOneAndUpdate(
      {
        _id: spaceId,
        userId: createIdFilter(userId),
        deletedAt: null,
      },
      {
        $set: {
          deletedAt: new Date(),
          isListning: false,
          listeningStartedAt: null,
        },
      },
      { new: false },
    );

    if (!response) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Space not found.",
      };
    }

    if (response.isListning && response.userId) {
      await endListeningUsage(String(response.userId));
    }

    return {
      status: STATUS_CODE.OK,
      message: "Space deleted successfully.",
      data: {
        deletedSpaceId: String(response._id),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const updateSpaceRepository = async (
  userId: string,
  spaceId: string,
  updates: { spacename?: string; description?: string },
) => {
  try {
    if (!mongoose.isValidObjectId(spaceId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'spaceId' value.",
      };
    }

    const $set: Record<string, string> = {};
    if (updates.spacename !== undefined) {
      $set.spacename = updates.spacename;
    }
    if (updates.description !== undefined) {
      $set.description = updates.description;
    }

    if (Object.keys($set).length === 0) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "At least one of 'spacename' or 'description' is required.",
      };
    }

    const updated = await CreateSpace.findOneAndUpdate(
      {
        _id: spaceId,
        userId: createIdFilter(userId),
        deletedAt: null,
      },
      { $set },
      { new: true },
    );

    if (!updated) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Space not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Space updated successfully.",
      data: {
        space: {
          id: String(updated._id),
          spacename: updated.spacename,
          description: updated.description,
        },
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getSpaceStatsRepository = async (
  userId: string,
  spaceId: string,
) => {
  try {
    const baseQuery = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      ...notDeletedFilter,
    };

    await ensureListIndexes();

    // One pass over the space's tasks yields both the total and the done count.
    const db = mongoose.connection;
    const [notesCount, taskTotals] = await Promise.all([
      db.collection("notes").countDocuments(baseQuery),
      db
        .collection("tasks")
        .aggregate<{ total: number; done: number }>([
          { $match: baseQuery },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              done: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$operation", "DONE"] },
                        { $in: ["$status", ["completed", "DONE", "done"]] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),
    ]);
    const tasksCount = taskTotals[0]?.total ?? 0;
    const doneTasksCount = taskTotals[0]?.done ?? 0;

    const completionPercentage =
      tasksCount === 0 ? 0 : Math.round((doneTasksCount / tasksCount) * 100);

    return {
      status: STATUS_CODE.OK,
      data: {
        notesCount,
        tasksCount,
        doneTasksCount,
        completionPercentage,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getProfileSummaryRepository = async (userId: string) => {
  try {
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

    const [notesCount, tasksCount] = await Promise.all([
      liveSpaceIds.length
        ? mongoose.connection.collection("notes").countDocuments({
            ...userFilter,
            spaceId: liveSpaceIdFilter,
            ...notDeleted,
          })
        : Promise.resolve(0),
      liveSpaceIds.length
        ? mongoose.connection.collection("tasks").countDocuments({
            ...userFilter,
            spaceId: liveSpaceIdFilter,
            ...notDeleted,
          })
        : Promise.resolve(0),
    ]);

    return {
      status: STATUS_CODE.OK,
      data: {
        notesCount,
        tasksCount,
        spacesCount: liveSpaces.length,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getNoteWorkspacesRepository = async (userId: string) => {
  try {
    const spaces = await CreateSpace.find({
      userId: createIdFilter(userId),
      deletedAt: null,
    })
      .select("spacename description")
      .sort({ _id: -1 })
      .lean();

    if (spaces.length === 0) {
      return {
        status: STATUS_CODE.OK,
        data: {
          spaces: [],
        },
      };
    }

    const spaceIds = spaces.map(space => space._id);
    const spaceIdStrings = spaceIds.map(spaceId => String(spaceId));
    const spaceIdFilter = {
      $in: [...spaceIds, ...spaceIdStrings],
    };
    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const noteCounts = await mongoose.connection
      .collection("notes")
      .aggregate([
        {
          $match: {
            userId: createIdFilter(userId),
            spaceId: spaceIdFilter,
            ...notDeleted,
          },
        },
        {
          $group: {
            _id: "$spaceId",
            notesCount: { $sum: 1 },
          },
        },
      ])
      .toArray()
      .catch(() => []);

    const noteCountBySpaceId = new Map<string, number>();
    (noteCounts as Array<{ _id?: unknown; notesCount?: number }>).forEach(
      item => {
        noteCountBySpaceId.set(String(item._id), item.notesCount ?? 0);
      },
    );

    return {
      status: STATUS_CODE.OK,
      data: {
        spaces: spaces.map(space => ({
          id: String(space._id),
          name: space.spacename,
          description: space.description,
          notesCount: noteCountBySpaceId.get(String(space._id)) ?? 0,
        })),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const NO_CONVERSATION_KEY = "none";

/**
 * Notes produced by a recording carry `conversationId`; carried-over notes may
 * only have `sourceConversationId`. Manual notes have neither.
 */
const conversationMatch = (conversationKey: string) => {
  if (conversationKey === NO_CONVERSATION_KEY) {
    return { conversationId: null, sourceConversationId: null };
  }

  const idFilter = createIdFilter(conversationKey);
  return {
    $or: [
      { conversationId: idFilter },
      { conversationId: null, sourceConversationId: idFilter },
    ],
  };
};

export const getStagedNotesBySpaceRepository = async (
  userId: string,
  spaceId: string,
  limit = 10,
  cursor?: string,
  dateKey?: string,
  conversationKey?: string,
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    if (cursor && !mongoose.isValidObjectId(cursor)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid cursor value.",
      };
    }

    if (dateKey && !DATE_KEY_PATTERN.test(dateKey)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'date' value. Expected YYYY-MM-DD.",
      };
    }

    const isFirstPage = !cursor;

    // Backfill staged-only notes once per list load (first page), not per page.
    await Promise.all([
      ensureListIndexes(),
      isFirstPage ? mirrorStagedNotesIntoMain(userId, spaceId) : undefined,
    ]);

    const baseQuery: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      $and: [notDeletedFilter],
    };

    if (dateKey) {
      const bounds = dayBoundsUtc(dateKey);
      if (!bounds) {
        return {
          status: STATUS_CODE.BAD_REQUEST,
          message: "Unable to resolve date bounds.",
        };
      }

      baseQuery.$and.push({
        createdAt: {
          $gte: bounds.start,
          $lt: bounds.endExclusive,
        },
      });
    }

    if (conversationKey) {
      baseQuery.$and.push(conversationMatch(conversationKey));
    }

    const pageQuery = { ...baseQuery };
    if (cursor) {
      pageQuery._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const db = mongoose.connection;
    const notesCollection = db.collection("notes");

    // Reads from main `notes` only to avoid staged+main duplicates. Only the
    // card fields are returned; the full body is served by getStagedNoteById.
    // The total is only needed once per list, so later pages skip the count.
    const [pageDocs, total] = await Promise.all([
      notesCollection
        .aggregate([
          { $match: pageQuery },
          { $sort: { _id: -1 } },
          { $limit: pageSize + 1 },
          {
            $project: {
              title: 1,
              confidence: 1,
              createdAt: 1,
              updatedAt: 1,
              conversationId: 1,
              sourceConversationId: 1,
              bodyPreview: {
                $substrCP: [
                  {
                    $trim: {
                      input: {
                        $cond: [{ $eq: [{ $type: "$body" }, "string"] }, "$body", ""],
                      },
                    },
                  },
                  0,
                  NOTE_PREVIEW_LENGTH,
                ],
              },
            },
          },
        ])
        .toArray(),
      isFirstPage ? notesCollection.countDocuments(baseQuery) : undefined,
    ]);

    const hasMore = pageDocs.length > pageSize;
    const results = pageDocs.slice(0, pageSize);
    const nextCursor =
      hasMore && results.length > 0
        ? String(results[results.length - 1]._id)
        : null;

    return {
      status: STATUS_CODE.OK,
      data: {
        notes: results.map(mapNoteListCard),
        nextCursor,
        ...(typeof total === "number" ? { total } : {}),
        ...(dateKey ? { date: dateKey } : {}),
        ...(conversationKey ? { conversationId: conversationKey } : {}),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getNoteConversationsBySpaceRepository = async (
  userId: string,
  spaceId: string,
  limit = 10,
  cursor?: string,
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const offset = cursor ? Number(cursor) : 0;

    if (!Number.isInteger(offset) || offset < 0) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid cursor value.",
      };
    }

    if (!cursor) {
      await mirrorStagedNotesIntoMain(userId, spaceId);
    }

    const db = mongoose.connection;
    const [result] = await db
      .collection("notes")
      .aggregate([
        {
          $match: {
            userId: createIdFilter(userId),
            spaceId: createIdFilter(spaceId),
            ...notDeletedFilter,
          },
        },
        {
          $project: {
            title: 1,
            createdAt: 1,
            groupKey: {
              $toString: {
                $ifNull: ["$conversationId", "$sourceConversationId"],
              },
            },
          },
        },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $group: {
            _id: "$groupKey",
            notesCount: { $sum: 1 },
            latestAt: { $max: "$createdAt" },
            earliestAt: { $min: "$createdAt" },
            titles: { $push: "$title" },
          },
        },
        {
          $project: {
            notesCount: 1,
            latestAt: 1,
            earliestAt: 1,
            previewTitles: { $slice: ["$titles", 3] },
          },
        },
        { $sort: { latestAt: -1, _id: 1 } },
        {
          $facet: {
            items: [{ $skip: offset }, { $limit: pageSize + 1 }],
            totals: [
              {
                $group: {
                  _id: null,
                  groups: { $sum: 1 },
                  notes: { $sum: "$notesCount" },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const items: Array<Record<string, any>> = result?.items ?? [];
    const totals = result?.totals?.[0] ?? { groups: 0, notes: 0 };
    const hasMore = items.length > pageSize;
    const pageItems = items.slice(0, pageSize);

    const conversationObjectIds = pageItems
      .map(item => item._id)
      .filter(
        (key): key is string =>
          typeof key === "string" && mongoose.isValidObjectId(key),
      )
      .map(key => new mongoose.Types.ObjectId(key));

    const conversations = conversationObjectIds.length
      ? await db
          .collection("conversations")
          .find(
            { _id: { $in: conversationObjectIds } },
            { projection: { startedAt: 1, stoppedAt: 1, sourceType: 1 } },
          )
          .toArray()
          .catch(() => [])
      : [];

    const conversationById = new Map(
      conversations.map(conversation => [String(conversation._id), conversation]),
    );

    return {
      status: STATUS_CODE.OK,
      data: {
        groups: pageItems.map(item => {
          const key = typeof item._id === "string" ? item._id : null;
          const conversation = key ? conversationById.get(key) : undefined;

          return {
            id: key ?? NO_CONVERSATION_KEY,
            conversationId: key,
            notesCount: item.notesCount ?? 0,
            latestAt: item.latestAt ?? null,
            earliestAt: item.earliestAt ?? null,
            startedAt: conversation?.startedAt ?? null,
            stoppedAt: conversation?.stoppedAt ?? null,
            sourceType: conversation?.sourceType ?? null,
            previewTitles: (item.previewTitles ?? [])
              .filter((title: unknown) => typeof title === "string" && title.trim())
              .map((title: string) => title.trim()),
          };
        }),
        nextCursor: hasMore ? String(offset + pageSize) : null,
        totalGroups: totals.groups ?? 0,
        totalNotes: totals.notes ?? 0,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getStagedNoteByIdRepository = async (noteId: string) => {
  try {
    if (!mongoose.isValidObjectId(noteId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'noteId' value.",
      };
    }

    const noteObjectId = new mongoose.Types.ObjectId(noteId);
    const stagedNote = await StagedNotes.findById(noteId)
      .select("title body evidence")
      .lean();

    const mainNote = stagedNote
      ? null
      : await mongoose.connection
          .collection("notes")
          .findOne(
            { _id: noteObjectId },
            { projection: { title: 1, body: 1, evidence: 1 } },
          )
          .catch(() => null);

    const note = stagedNote ?? mainNote;

    if (!note) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Note not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      data: {
        id: String(note._id),
        title: note.title ?? "",
        body: note.body ?? "",
        evidence: note.evidence ?? null,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const deleteStagedNoteRepository = async (
  userId: string,
  noteId: string,
) => {
  try {
    if (!mongoose.isValidObjectId(noteId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'noteId' value.",
      };
    }

    const stagedNote = await StagedNotes.findOneAndDelete({
      _id: noteId,
      userId: createIdFilter(userId),
    });

    const mainResult = await mongoose.connection
      .collection("notes")
      .findOneAndDelete({
        _id: new mongoose.Types.ObjectId(noteId),
        userId: createIdFilter(userId),
      })
      .catch(() => null);

    const mainNote = (() => {
      if (!mainResult || typeof mainResult !== "object") {
        return null;
      }
      if ("value" in mainResult) {
        return (
          (mainResult as unknown as { value: Record<string, any> | null })
            .value ?? null
        );
      }
      return mainResult as Record<string, any>;
    })();

    if (!stagedNote && !mainNote) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Note not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Note deleted successfully.",
      data: {
        deletedNoteId: String(
          stagedNote?._id ?? mainNote?._id ?? noteId,
        ),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

const unwrapFindOneResult = (
  result: unknown,
): Record<string, any> | null => {
  if (!result || typeof result !== "object") {
    return null;
  }
  if ("value" in result) {
    return (
      (result as unknown as { value: Record<string, any> | null }).value ?? null
    );
  }
  return result as Record<string, any>;
};

export const updateStagedNoteRepository = async (
  userId: string,
  noteId: string,
  updates: { title?: string; body?: string; dateKey?: string },
) => {
  try {
    if (!mongoose.isValidObjectId(noteId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'noteId' value.",
      };
    }

    if (updates.dateKey && !DATE_KEY_PATTERN.test(updates.dateKey)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'date' value. Expected YYYY-MM-DD.",
      };
    }

    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };
    if (updates.title !== undefined) {
      $set.title = updates.title;
    }
    if (updates.body !== undefined) {
      $set.body = updates.body;
    }
    if (updates.dateKey !== undefined) {
      $set.createdAt = toDateFromKey(updates.dateKey);
    }

    const noteObjectId = new mongoose.Types.ObjectId(noteId);
    const ownershipFilter = {
      _id: noteObjectId,
      userId: createIdFilter(userId),
    };
    const notesCollection = mongoose.connection.collection("notes");

    // Prefer main collection, then mirror to staged.
    const mainResult = await notesCollection
      .findOneAndUpdate(ownershipFilter, { $set }, { returnDocument: "after" })
      .catch(() => null);
    const mainNote = unwrapFindOneResult(mainResult);

    if (mainNote) {
      try {
        await StagedNotes.findOneAndUpdate(
          { _id: noteId, userId: createIdFilter(userId) },
          { $set },
          { new: true },
        );
      } catch (mirrorError) {
        console.log("staged note update mirror failed", mirrorError);
      }

      return {
        status: STATUS_CODE.OK,
        message: "Note updated successfully.",
        data: {
          note: mapStagedNoteCard(mainNote),
        },
      };
    }

    // Main not found — try staged, then sync back to main.
    const stagedNote = await StagedNotes.findOneAndUpdate(
      { _id: noteId, userId: createIdFilter(userId) },
      { $set },
      { new: true },
    ).lean();

    if (!stagedNote) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Note not found.",
      };
    }

    try {
      await notesCollection.updateOne(
        { _id: noteObjectId, userId: createIdFilter(userId) },
        {
          $set: {
            title: stagedNote.title,
            body: stagedNote.body,
            confidence: stagedNote.confidence ?? null,
            evidence: stagedNote.evidence ?? [],
            origin: stagedNote.origin ?? "explicit",
            source: stagedNote.source ?? "manual",
            userId: stagedNote.userId,
            spaceId: stagedNote.spaceId,
            createdAt: stagedNote.createdAt ?? now,
            updatedAt: stagedNote.updatedAt ?? now,
            deletedAt: null,
          },
          $setOnInsert: {
            _id: noteObjectId,
          },
        },
        { upsert: true },
      );
    } catch (syncError) {
      console.log("main note sync after staged update failed", syncError);
    }

    return {
      status: STATUS_CODE.OK,
      message: "Note updated successfully.",
      data: {
        note: mapStagedNoteCard(stagedNote as Record<string, any>),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getStagedTasksBySpaceRepository = async (
  userId: string,
  spaceId: string,
  limit = 10,
  cursor?: string,
  dateKey?: string,
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    if (cursor && !mongoose.isValidObjectId(cursor)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid cursor value.",
      };
    }

    if (dateKey && !DATE_KEY_PATTERN.test(dateKey)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'date' value. Expected YYYY-MM-DD.",
      };
    }

    const isFirstPage = !cursor;

    // Backfill staged-only tasks once per list load (first page), not per page.
    await Promise.all([
      ensureListIndexes(),
      isFirstPage ? mirrorStagedTasksIntoMain(userId, spaceId) : undefined,
    ]);

    const baseQuery: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      $and: [notDeletedFilter],
    };

    if (dateKey) {
      const bounds = dayBoundsUtc(dateKey);
      if (!bounds) {
        return {
          status: STATUS_CODE.BAD_REQUEST,
          message: "Unable to resolve date bounds.",
        };
      }

      // Prefer dueDate match; also include undated tasks created that local day.
      baseQuery.$and.push({
        $or: [
          { dueDate: dateKey },
          {
            $and: [
              {
                $or: [
                  { dueDate: null },
                  { dueDate: { $exists: false } },
                  { dueDate: "" },
                ],
              },
              {
                createdAt: {
                  $gte: bounds.start,
                  $lt: bounds.endExclusive,
                },
              },
            ],
          },
        ],
      });
    }

    const pageQuery = { ...baseQuery };
    if (cursor) {
      pageQuery._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const tasksCollection = mongoose.connection.collection("tasks");

    const [pageDocs, total] = await Promise.all([
      tasksCollection
        .find(pageQuery)
        .project({
          title: 1,
          description: 1,
          body: 1,
          evidence: 1,
          operation: 1,
          status: 1,
          priority: 1,
          dueDate: 1,
          confidence: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ _id: -1 })
        .limit(pageSize + 1)
        .toArray(),
      isFirstPage ? tasksCollection.countDocuments(baseQuery) : undefined,
    ]);

    const hasMore = pageDocs.length > pageSize;
    const results = pageDocs.slice(0, pageSize);
    const nextCursor =
      hasMore && results.length > 0
        ? String(results[results.length - 1]._id)
        : null;

    return {
      status: STATUS_CODE.OK,
      data: {
        tasks: results.map(mapStagedTaskCard),
        nextCursor,
        ...(typeof total === "number" ? { total } : {}),
        ...(dateKey ? { date: dateKey } : {}),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const deleteStagedTaskRepository = async (
  userId: string,
  taskId: string,
) => {
  try {
    if (!mongoose.isValidObjectId(taskId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'taskId' value.",
      };
    }

    const stagedTask = await StagedTasks.findOneAndDelete({
      _id: taskId,
      userId: createIdFilter(userId),
    });

    const mainResult = await mongoose.connection
      .collection("tasks")
      .findOneAndDelete({
        _id: new mongoose.Types.ObjectId(taskId),
        userId: createIdFilter(userId),
      })
      .catch(() => null);

    const mainTask = (() => {
      if (!mainResult || typeof mainResult !== "object") {
        return null;
      }
      if ("value" in mainResult) {
        return (
          (mainResult as unknown as { value: Record<string, any> | null })
            .value ?? null
        );
      }
      return mainResult as Record<string, any>;
    })();

    if (!stagedTask && !mainTask) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Task not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Task deleted successfully.",
      data: {
        deletedTaskId: String(
          stagedTask?._id ?? mainTask?._id ?? taskId,
        ),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const updateStagedTaskRepository = async (
  userId: string,
  taskId: string,
  updates: {
    title?: string;
    description?: string;
    dateKey?: string;
    priority?: string;
  },
) => {
  try {
    if (!mongoose.isValidObjectId(taskId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'taskId' value.",
      };
    }

    if (updates.dateKey && !DATE_KEY_PATTERN.test(updates.dateKey)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'date' value. Expected YYYY-MM-DD.",
      };
    }

    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (updates.title !== undefined) {
      $set.title = updates.title;
    }
    if (updates.description !== undefined) {
      $set.body = updates.description;
      $set.description = updates.description;
    }
    if (updates.dateKey !== undefined) {
      const dueDate = DATE_KEY_PATTERN.test(updates.dateKey)
        ? updates.dateKey
        : null;
      $set.dueDate = dueDate;
      $set.dueDateStatus = dueDate ? "resolved" : "none";
    }
    if (updates.priority !== undefined) {
      const value = String(updates.priority || "Medium").trim().toLowerCase();
      if (value === "high" || value === "h" || value === "urgent") {
        $set.priority = "High";
      } else if (value === "low" || value === "l") {
        $set.priority = "Low";
      } else {
        $set.priority = "Medium";
      }
    }

    const taskObjectId = new mongoose.Types.ObjectId(taskId);
    const ownershipFilter = {
      _id: taskObjectId,
      userId: createIdFilter(userId),
    };
    const tasksCollection = mongoose.connection.collection("tasks");

    const mainResult = await tasksCollection
      .findOneAndUpdate(ownershipFilter, { $set }, { returnDocument: "after" })
      .catch(() => null);
    const mainTask = unwrapFindOneResult(mainResult);

    if (mainTask) {
      try {
        await StagedTasks.findOneAndUpdate(
          { _id: taskId, userId: createIdFilter(userId) },
          { $set },
          { new: true },
        );
      } catch (mirrorError) {
        console.log("staged task update mirror failed", mirrorError);
      }

      return {
        status: STATUS_CODE.OK,
        message: "Task updated successfully.",
        data: {
          task: mapStagedTaskCard(mainTask),
        },
      };
    }

    const stagedTask = await StagedTasks.findOneAndUpdate(
      { _id: taskId, userId: createIdFilter(userId) },
      { $set },
      { new: true },
    ).lean();

    if (!stagedTask) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Task not found.",
      };
    }

    try {
      await tasksCollection.updateOne(
        { _id: taskObjectId, userId: createIdFilter(userId) },
        {
          $set: {
            title: stagedTask.title,
            body: stagedTask.body ?? stagedTask.description ?? "",
            description: stagedTask.description ?? stagedTask.body ?? "",
            evidence: stagedTask.evidence ?? [],
            operation: stagedTask.operation ?? null,
            status: stagedTask.status ?? "pending",
            priority: stagedTask.priority ?? null,
            dueDate: stagedTask.dueDate ?? null,
            dueDateStatus: stagedTask.dueDateStatus ?? (
              stagedTask.dueDate ? "resolved" : "none"
            ),
            confidence: stagedTask.confidence ?? null,
            origin: stagedTask.origin ?? "explicit",
            source: stagedTask.source ?? "manual",
            userId: stagedTask.userId,
            spaceId: stagedTask.spaceId,
            createdAt: stagedTask.createdAt ?? now,
            updatedAt: stagedTask.updatedAt ?? now,
            deletedAt: null,
          },
          $setOnInsert: {
            _id: taskObjectId,
          },
        },
        { upsert: true },
      );
    } catch (syncError) {
      console.log("main task sync after staged update failed", syncError);
    }

    return {
      status: STATUS_CODE.OK,
      message: "Task updated successfully.",
      data: {
        task: mapStagedTaskCard(stagedTask as Record<string, any>),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const setStagedTaskStatusRepository = async (
  userId: string,
  taskId: string,
  done: boolean,
) => {
  try {
    if (!mongoose.isValidObjectId(taskId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'taskId' value.",
      };
    }

    const now = new Date();
    const $set: Record<string, unknown> = {
      updatedAt: now,
      operation: done ? "DONE" : "CREATE",
      status: done ? "completed" : "pending",
    };

    const taskObjectId = new mongoose.Types.ObjectId(taskId);
    const ownershipFilter = {
      _id: taskObjectId,
      userId: createIdFilter(userId),
    };
    const tasksCollection = mongoose.connection.collection("tasks");

    const mainResult = await tasksCollection
      .findOneAndUpdate(ownershipFilter, { $set }, { returnDocument: "after" })
      .catch(() => null);
    const mainTask = unwrapFindOneResult(mainResult);

    if (mainTask) {
      try {
        await StagedTasks.findOneAndUpdate(
          { _id: taskId, userId: createIdFilter(userId) },
          { $set },
          { new: true },
        );
      } catch (mirrorError) {
        console.log("staged task status mirror failed", mirrorError);
      }

      return {
        status: STATUS_CODE.OK,
        message: done ? "Task marked as done." : "Task marked as open.",
        data: {
          task: mapStagedTaskCard(mainTask),
        },
      };
    }

    const stagedTask = await StagedTasks.findOneAndUpdate(
      { _id: taskId, userId: createIdFilter(userId) },
      { $set },
      { new: true },
    ).lean();

    if (!stagedTask) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Task not found.",
      };
    }

    try {
      await tasksCollection.updateOne(
        { _id: taskObjectId, userId: createIdFilter(userId) },
        {
          $set: {
            ...$set,
            title: stagedTask.title,
            body: stagedTask.body ?? stagedTask.description ?? "",
            description: stagedTask.description ?? stagedTask.body ?? "",
            userId: stagedTask.userId,
            spaceId: stagedTask.spaceId,
            priority: stagedTask.priority ?? null,
            dueDate: stagedTask.dueDate ?? null,
            createdAt: stagedTask.createdAt ?? now,
            deletedAt: null,
          },
          $setOnInsert: {
            _id: taskObjectId,
          },
        },
        { upsert: true },
      );
    } catch (syncError) {
      console.log("main task sync after status update failed", syncError);
    }

    return {
      status: STATUS_CODE.OK,
      message: done ? "Task marked as done." : "Task marked as open.",
      data: {
        task: mapStagedTaskCard(stagedTask as Record<string, any>),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const createStagedNoteRepository = async (
  userId: string,
  spaceId: string,
  title: string,
  body: string,
  dateKey?: string,
) => {
  try {
    const access = await assertCanCreateInSpace(userId, spaceId, "notes");

    if (!access.ok) {
      return {
        status: access.status,
        message: access.message,
        data: access.data,
      };
    }

    const now = new Date();
    const createdAt = toDateFromKey(dateKey);
    const _id = new mongoose.Types.ObjectId();
    const payload = {
      _id,
      title,
      body,
      confidence: 1,
      evidence: [],
      origin: "explicit",
      source: "manual",
      userId: toOwnedObjectId(userId),
      spaceId: toOwnedObjectId(spaceId),
      createdAt,
      updatedAt: now,
      deletedAt: null,
    };

    // Official store is main `notes`. Staged is mirrored for AI/legacy readers.
    await mongoose.connection.collection("notes").insertOne({ ...payload });
    try {
      await StagedNotes.create({ ...payload });
    } catch (mirrorError) {
      console.log("staged note mirror failed (main note saved)", mirrorError);
    }

    return {
      status: STATUS_CODE.CREATED,
      message: "Note created successfully.",
      data: {
        note: mapStagedNoteCard(payload),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const createStagedTaskRepository = async (
  userId: string,
  spaceId: string,
  title: string,
  description: string,
  dateKey?: string,
  priority?: string,
) => {
  try {
    const access = await assertCanCreateInSpace(userId, spaceId, "tasks");

    if (!access.ok) {
      return {
        status: access.status,
        message: access.message,
        data: access.data,
      };
    }

    const now = new Date();
    const dueDate = dateKey && DATE_KEY_PATTERN.test(dateKey) ? dateKey : null;
    const normalizedPriority = (() => {
      const value = String(priority || "Medium").trim().toLowerCase();
      if (value === "high" || value === "h" || value === "urgent") return "High";
      if (value === "low" || value === "l") return "Low";
      return "Medium";
    })();
    const _id = new mongoose.Types.ObjectId();
    const payload = {
      _id,
      title,
      body: description,
      description,
      operation: "CREATE",
      status: "pending",
      origin: "explicit",
      source: "manual",
      confidence: 1,
      needsConfirmation: false,
      evidence: [],
      priority: normalizedPriority,
      dueDate,
      dueDateStatus: dueDate ? "resolved" : "none",
      userId: toOwnedObjectId(userId),
      spaceId: toOwnedObjectId(spaceId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // Official store is main `tasks`. Staged is mirrored for AI/legacy readers.
    await mongoose.connection.collection("tasks").insertOne({ ...payload });
    try {
      await StagedTasks.create({ ...payload });
    } catch (mirrorError) {
      console.log("staged task mirror failed (main task saved)", mirrorError);
    }

    return {
      status: STATUS_CODE.CREATED,
      message: "Task created successfully.",
      data: {
        task: mapStagedTaskCard(payload),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getNoteDateMarkersBySpaceRepository = async (
  userId: string,
  spaceId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    if (!DATE_KEY_PATTERN.test(fromDate) || !DATE_KEY_PATTERN.test(toDate)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid date range. Expected YYYY-MM-DD.",
      };
    }

    if (fromDate > toDate) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "'from' must be on or before 'to'.",
      };
    }

    const startBounds = dayBoundsUtc(fromDate);
    const endBounds = dayBoundsUtc(toDate);
    if (!startBounds || !endBounds) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Unable to resolve date bounds.",
      };
    }

    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const rows = await mongoose.connection
      .collection("notes")
      .aggregate([
        {
          $match: {
            userId: createIdFilter(userId),
            spaceId: createIdFilter(spaceId),
            $and: [
              notDeleted,
              {
                createdAt: {
                  $gte: startBounds.start,
                  $lt: endBounds.endExclusive,
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: DEFAULT_REMINDER_TIMEZONE,
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return {
      status: STATUS_CODE.OK,
      data: {
        dates: rows
          .map((row) => String(row._id ?? ""))
          .filter((key) => DATE_KEY_PATTERN.test(key)),
        from: fromDate,
        to: toDate,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};

//------------------------------------------------------------------------------------------------------------------

export const getTaskDateMarkersBySpaceRepository = async (
  userId: string,
  spaceId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    if (!DATE_KEY_PATTERN.test(fromDate) || !DATE_KEY_PATTERN.test(toDate)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid date range. Expected YYYY-MM-DD.",
      };
    }

    if (fromDate > toDate) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "'from' must be on or before 'to'.",
      };
    }

    const startBounds = dayBoundsUtc(fromDate);
    const endBounds = dayBoundsUtc(toDate);
    if (!startBounds || !endBounds) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Unable to resolve date bounds.",
      };
    }

    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const rows = await mongoose.connection
      .collection("tasks")
      .aggregate([
        {
          $match: {
            userId: createIdFilter(userId),
            spaceId: createIdFilter(spaceId),
            $and: [
              notDeleted,
              {
                $or: [
                  {
                    dueDate: { $gte: fromDate, $lte: toDate },
                  },
                  {
                    $and: [
                      {
                        $or: [
                          { dueDate: null },
                          { dueDate: { $exists: false } },
                          { dueDate: "" },
                        ],
                      },
                      {
                        createdAt: {
                          $gte: startBounds.start,
                          $lt: endBounds.endExclusive,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          $project: {
            dateKey: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$dueDate", null] },
                    { $ne: ["$dueDate", ""] },
                  ],
                },
                "$dueDate",
                {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                    timezone: DEFAULT_REMINDER_TIMEZONE,
                  },
                },
              ],
            },
          },
        },
        {
          $match: {
            dateKey: { $gte: fromDate, $lte: toDate },
          },
        },
        {
          $group: {
            _id: "$dateKey",
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return {
      status: STATUS_CODE.OK,
      data: {
        dates: rows
          .map((row) => String(row._id ?? ""))
          .filter((key) => DATE_KEY_PATTERN.test(key)),
        from: fromDate,
        to: toDate,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};
