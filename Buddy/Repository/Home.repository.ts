import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api";
import { CreateSpace } from "../Modals/Home.Modal";
import { isGeneratorFunction } from "node:util/types";

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
          message: 'Invalid cursor value.',
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
      nextCursor = String(
        results[results.length - 1]._id,
      );
    }

    return {
      status: STATUS_CODE.OK,
      message: 'User spaces fetched successfully.',
      data: {
        spaces: results,
        nextCursor,
      },
    };
  } catch (error) {
    console.log(
      'error in Home repository Layer ',
      error,
    );
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

export const startListningRepository = async (spaceId: string) => {
  try {
    const response = await CreateSpace.findByIdAndUpdate(spaceId, {
      $set: {
        isListining: true,
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
      message: "Start Listning now ...",
    };
  } catch (error) {
    console.log("error in Home repository Layer ", error);
    throw error;
  }
};
