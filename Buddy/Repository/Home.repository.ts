import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api";
import { CreateSpace } from "../Modals/Home.Modal";
import { StagedNotes, StagedTasks } from "../Modals/Staged.Modal";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

export const createSpaceRepository = async (
  spacename: string,
  userId: string,
) => {
  try {
    const createSpcace = CreateSpace.create({
      spacename,
      userId,
    });

    if (!createSpcace) {
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

    const query: Record<string, any> = { userId };

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

    return {
      status: STATUS_CODE.OK,
      message: "User spaces fetched successfully.",
      data: {
        spaces: results,
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
      isListining: true,
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
  isListning: boolean,
) => {
  try {
    const response = await CreateSpace.findByIdAndUpdate(spaceId, {
      $set: {
        isListining: isListning,
      },
    });

    if (!response) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Error while selecting Space",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: isListning ? "Listning start now ..." : "Listning Stops",
      isListning: response.isListining
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

export const getNoteWorkspacesRepository = async (userId: string) => {
  try {
    const spaces = await CreateSpace.find({
      userId: createIdFilter(userId),
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
        notes: results.map(note => ({
          id: String(note._id),
          title: note.title ?? "",
          bodyPreview:
            typeof note.body === "string"
              ? note.body.trim().slice(0, 140)
              : "",
          confidence: note.confidence ?? null,
          createdAt: note.createdAt ?? null,
          updatedAt: note.updatedAt ?? null,
        })),
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
      .select("title description body operation status priority dueDate confidence createdAt updatedAt")
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
        tasks: results.map(task => {
          const description =
            typeof task.description === "string"
              ? task.description
              : typeof task.body === "string"
                ? task.body
                : "";

          return {
            id: String(task._id),
            title: task.title ?? "",
            descriptionPreview: description.trim().slice(0, 140),
            operation: task.operation ?? task.status ?? null,
            priority: task.priority ?? null,
            dueDate: task.dueDate ?? null,
            confidence: task.confidence ?? null,
            createdAt: task.createdAt ?? null,
            updatedAt: task.updatedAt ?? null,
          };
        }),
        nextCursor,
      },
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};
