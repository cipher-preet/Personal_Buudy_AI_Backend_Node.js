import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { Feedback } from "../Modals/Feedback.Modal.js";

export type FeedbackWriteInput = {
  topicId: string;
  topicLabel: string;
  message: string;
};

export const createFeedbackRepository = async (
  userId: string,
  payload: FeedbackWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(userId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid user.",
      };
    }

    const created = await Feedback.create({
      userId: new mongoose.Types.ObjectId(userId),
      topicId: payload.topicId,
      topicLabel: payload.topicLabel,
      message: payload.message,
      status: "open",
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to submit feedback.",
      };
    }

    return {
      status: STATUS_CODE.CREATED,
      data: {
        message: "Feedback submitted successfully.",
        feedbackId: String(created._id),
      },
    };
  } catch (error) {
    console.log("error in Feedback repository Layer ", error);
    throw error;
  }
};
