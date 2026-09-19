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

/** Ensure staged notes/tasks also exist in official main collections. */
const mirrorStagedNotesIntoMain = async (userId: string, spaceId: string) => {
  try {
    const staged = await StagedNotes.find({
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      ...notDeletedFilter,
    })
      .limit(500)
      .lean();

    if (!staged.length) {
      return;
    }

    const notes = mongoose.connection.collection("notes");
    await notes.bulkWrite(
      staged.map(note => {
        const doc = { ...note, deletedAt: null };
        const filter =
          typeof note.fingerprint === "string" && note.fingerprint.trim()
            ? {
                fingerprint: note.fingerprint,
                userId: note.userId,
                spaceId: note.spaceId,
              }
            : { _id: note._id };

        return {
          updateOne: {
            filter,
            update: {
              $set: {
                title: doc.title,
                body: doc.body,
                confidence: doc.confidence ?? null,
                evidence: doc.evidence ?? [],
                origin: doc.origin ?? "explicit",
                source: doc.source ?? "manual",
                userId: doc.userId,
                spaceId: doc.spaceId,
                updatedAt: doc.updatedAt ?? new Date(),
                deletedAt: null,
              },
              $setOnInsert: {
                _id: note._id,
                createdAt: doc.createdAt ?? new Date(),
              },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  } catch (error) {
    console.log("mirrorStagedNotesIntoMain failed", error);
  }
};

const mirrorStagedTasksIntoMain = async (userId: string, spaceId: string) => {
  try {
    const staged = await StagedTasks.find({
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      ...notDeletedFilter,
    })
      .limit(500)
      .lean();

    if (!staged.length) {
      return;
    }

    const tasks = mongoose.connection.collection("tasks");
    await tasks.bulkWrite(
      staged.map(task => {
        const doc = { ...task, deletedAt: null };
        const filter =
          typeof task.fingerprint === "string" && task.fingerprint.trim()
            ? {
                fingerprint: task.fingerprint,
                userId: task.userId,
                spaceId: task.spaceId,
              }
            : { _id: task._id };

        return {
          updateOne: {
            filter,
            update: {
              $set: {
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
                userId: doc.userId,
                spaceId: doc.spaceId,
                updatedAt: doc.updatedAt ?? new Date(),
                deletedAt: null,
              },
              $setOnInsert: {
                _id: task._id,
                createdAt: doc.createdAt ?? new Date(),
              },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
  } catch (error) {
    console.log("mirrorStagedTasksIntoMain failed", error);
  }
};

const mapStagedNoteCard = (note: Record<string, any>) => {
  const body = typeof note.body === "string" ? note.body.trim() : "";

  return {
    id: String(note._id),
    title: note.title ?? "",
    body,
    bodyPreview: body.slice(0, 140),
    confidence: note.confidence ?? null,
    createdAt: note.createdAt ?? null,
    updatedAt: note.updatedAt ?? null,
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

export const getUserSpacesByUserIdRepository = async (
  userId: string,
  limit = 10,
  cursor?: string,
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

    const spaces = await CreateSpace.find(query)
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
    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const taskCounts =
      results.length > 0
        ? await mongoose.connection
            .collection("tasks")
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
                  tasksCount: { $sum: 1 },
                },
              },
            ])
            .toArray()
            .catch(() => [])
        : [];
    const taskCountBySpaceId = new Map<string, number>();
    (taskCounts as Array<{ _id?: unknown; tasksCount?: number }>).forEach(
      item => {
        taskCountBySpaceId.set(String(item._id), item.tasksCount ?? 0);
      },
    );

    return {
      status: STATUS_CODE.OK,
      message: "User spaces fetched successfully.",
      data: {
        spaces: results.map(space => ({
          ...space,
          tasksCount: taskCountBySpaceId.get(String(space._id)) ?? 0,
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
    const response = await CreateSpace.find({
      userId: userId,
      isListning: true,
      deletedAt: null,
    }).select("-createdAt -updatedAt -__v");

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

export const getSpaceStatsRepository = async (
  userId: string,
  spaceId: string,
) => {
  try {
    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };
    const baseQuery = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      $and: [notDeleted],
    };

    const db = mongoose.connection;
    const [notesCount, tasksCount, doneTasksCount] = await Promise.all([
      db.collection("notes").countDocuments(baseQuery),
      db.collection("tasks").countDocuments(baseQuery),
      db.collection("tasks").countDocuments({
        ...baseQuery,
        $and: [
          notDeleted,
          {
            $or: [
              { operation: "DONE" },
              { status: { $in: ["completed", "DONE", "done"] } },
            ],
          },
        ],
      }),
    ]);

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

export const getStagedNotesBySpaceRepository = async (
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

    // Backfill any staged-only notes into official `notes` collection.
    await mirrorStagedNotesIntoMain(userId, spaceId);

    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const baseQuery: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      $and: [notDeleted],
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

    const pageQuery = { ...baseQuery };
    if (cursor) {
      pageQuery._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const db = mongoose.connection;
    const notesCollection = db.collection("notes");

    // Date-wise (and default) list reads from main `notes` only to avoid
    // staged+main duplicates. Cursor pagination is scoped to this query.
    const [pageDocs, total] = await Promise.all([
      notesCollection
        .find(pageQuery)
        .project({
          title: 1,
          body: 1,
          confidence: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ _id: -1 })
        .limit(pageSize + 1)
        .toArray(),
      notesCollection.countDocuments(baseQuery),
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
        notes: results.map(mapStagedNoteCard),
        nextCursor,
        total,
        ...(dateKey ? { date: dateKey } : {}),
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

    // Backfill any staged-only tasks into official `tasks` collection.
    await mirrorStagedTasksIntoMain(userId, spaceId);

    const notDeleted = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };

    const baseQuery: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
      $and: [notDeleted],
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
      tasksCollection.countDocuments(baseQuery),
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
        total,
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
