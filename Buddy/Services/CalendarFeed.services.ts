import { getCalendarFeedRepository } from "../Repository/CalendarFeed.repository.js";

export const getCalendarFeedServices = async (
  userId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    return await getCalendarFeedRepository(userId, fromDate, toDate);
  } catch (error) {
    console.log("error in CalendarFeed service Layer ", error);
    throw error;
  }
};
