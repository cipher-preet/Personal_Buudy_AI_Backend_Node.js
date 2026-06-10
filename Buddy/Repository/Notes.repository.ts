import mongoose, { Types } from "mongoose";
import { STATUS_CODE } from "../../Api";
import { AiMemoryNotes } from "../Modals/Notes.Modal";

type AiMemoryNoteLean = {
  _id: Types.ObjectId;
  user_id: string;
  space_id: string;
  createdAt?: Date;
};

export const getNotesByUserIdRepository = async (
  userId: string,
  spaceId: string,
  limit = 10,
  cursor?: string,
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);

    const query: Record<string, any> = {
      user_id: userId,
      space_id: spaceId,
    };

    if (cursor) {
      if (!mongoose.isValidObjectId(cursor)) {
        return {
          status: STATUS_CODE.BAD_REQUEST,
          message: "Invalid cursor value.",
        };
      }

      query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const notes = await AiMemoryNotes.find(query)
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean<AiMemoryNoteLean[]>();

    const hasNextPage = notes.length > pageSize;
    const data = hasNextPage ? notes.slice(0, pageSize) : notes;

    const nextCursor =
      hasNextPage && data.length > 0
        ? data[data.length - 1]._id.toString()
        : null;

    return {
      data,
      hasNextPage,
      nextCursor,
    };
  } catch (error) {
    console.log("error in Notes repository Layer ", error);
    throw error;
  }
};
