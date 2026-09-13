import {
  createFeedbackRepository,
  type FeedbackWriteInput,
} from "../Repository/Feedback.repository.js";

export const createFeedbackServices = async (
  userId: string,
  payload: FeedbackWriteInput,
) => {
  try {
    return await createFeedbackRepository(userId, payload);
  } catch (error) {
    console.log("error in Feedback service Layer ", error);
    throw error;
  }
};
