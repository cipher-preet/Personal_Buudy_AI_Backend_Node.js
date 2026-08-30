import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { validatePlanLimit } from "../../Plans/Services/Plan.services.js";
import { CreateSpace } from "../Modals/Home.Modal.js";
import { StagedNotes, StagedTasks } from "../Modals/Staged.Modal.js";

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
    };
  }

  if (!space) {
    return {
      ok: false as const,
      status: STATUS_CODE.NOT_FOUND,
      message: "Space not found.",
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

const mapStagedNoteCard = (note: Record<string, any>) => ({
  id: String(note._id),
  title: note.title ?? "",
  bodyPreview:
    typeof note.body === "string" ? note.body.trim().slice(0, 140) : "",
  confidence: note.confidence ?? null,
  createdAt: note.createdAt ?? null,
  updatedAt: note.updatedAt ?? null,
});

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
    const taskCounts =
      results.length > 0
        ? await StagedTasks.aggregate([
            {
              $match: {
                userId: createIdFilter(userId),
                spaceId: {
                  $in: [...resultSpaceIds, ...resultSpaceIdStrings],
                },
              },
            },
            {
              $group: {
                _id: "$spaceId",
                tasksCount: { $sum: 1 },
              },
            },
          ])
        : [];
    const taskCountBySpaceId = new Map<string, number>();
    taskCounts.forEach(item => {
      taskCountBySpaceId.set(String(item._id), item.tasksCount);
    });

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

    const response = await CreateSpace.findOneAndUpdate(
      {
        _id: spaceId,
        deletedAt: null,
      },
      {
        $set: {
          isListning: isListning,
        },
      },
      { new: true },
    );

    if (!response) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Error while selecting Space",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: isListning ? "Listning start now ..." : "Listning Stops",
      isListning: response.isListning,
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
        },
      },
      { new: true },
    );

    if (!response) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Space not found.",
      };
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
    const query = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
    };

    const [notesCount, tasksCount, doneTasksCount] = await Promise.all([
      StagedNotes.countDocuments(query),
      StagedTasks.countDocuments(query),
      StagedTasks.countDocuments({
        ...query,
        operation: "DONE",
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
    const query = {
      userId: createIdFilter(userId),
    };

    const [notesCount, tasksCount, spacesCount] = await Promise.all([
      StagedNotes.countDocuments(query),
      StagedTasks.countDocuments(query),
      CreateSpace.countDocuments({
        userId: createIdFilter(userId),
        deletedAt: null,
      }),
    ]);

    return {
      status: STATUS_CODE.OK,
      data: {
        notesCount,
        tasksCount,
        spacesCount,
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

    const noteCounts = await StagedNotes.aggregate([
      {
        $match: {
          userId: createIdFilter(userId),
          spaceId: {
            $in: [...spaceIds, ...spaceIdStrings],
          },
        },
      },
      {
        $group: {
          _id: "$spaceId",
          notesCount: { $sum: 1 },
        },
      },
    ]);

    const noteCountBySpaceId = new Map<string, number>();
    noteCounts.forEach(item => {
      noteCountBySpaceId.set(String(item._id), item.notesCount);
    });

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
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    const query: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
    };

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

    const notes = await StagedNotes.find(query)
      .select("title body confidence createdAt updatedAt")
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean();

    const results = notes.slice(0, pageSize);
    const nextCursor =
      notes.length > pageSize && results.length > 0
        ? String(results[results.length - 1]._id)
        : null;

    return {
      status: STATUS_CODE.OK,
      data: {
        notes: results.map(mapStagedNoteCard),
        nextCursor,
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

    const note = await StagedNotes.findById(noteId)
      .select("title body evidence")
      .lean();

    if (!note) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Staged note not found.",
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

    const note = await StagedNotes.findOneAndDelete({
      _id: noteId,
      userId: createIdFilter(userId),
    });

    if (!note) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Staged note not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Note deleted successfully.",
      data: {
        deletedNoteId: String(note._id),
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
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    const query: Record<string, any> = {
      userId: createIdFilter(userId),
      spaceId: createIdFilter(spaceId),
    };

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

    const tasks = await StagedTasks.find(query)
      .select("title description body evidence operation status priority dueDate confidence createdAt updatedAt")
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean();

    const results = tasks.slice(0, pageSize);
    const nextCursor =
      tasks.length > pageSize && results.length > 0
        ? String(results[results.length - 1]._id)
        : null;

    return {
      status: STATUS_CODE.OK,
      data: {
        tasks: results.map(mapStagedTaskCard),
        nextCursor,
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

    const task = await StagedTasks.findOneAndDelete({
      _id: taskId,
      userId: createIdFilter(userId),
    });

    if (!task) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Staged task not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Task deleted successfully.",
      data: {
        deletedTaskId: String(task._id),
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
      };
    }

    const now = new Date();
    const createdAt = toDateFromKey(dateKey);
    const created = await StagedNotes.create({
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
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to create note.",
      };
    }

    return {
      status: STATUS_CODE.CREATED,
      message: "Note created successfully.",
      data: {
        note: mapStagedNoteCard(created.toObject()),
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
      };
    }

    const now = new Date();
    const dueDate = dateKey && DATE_KEY_PATTERN.test(dateKey) ? dateKey : null;
    const created = await StagedTasks.create({
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
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to create task.",
      };
    }

    return {
      status: STATUS_CODE.CREATED,
      message: "Task created successfully.",
      data: {
        task: mapStagedTaskCard(created.toObject()),
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};
