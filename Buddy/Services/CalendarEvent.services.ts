import {
  createCalendarEventRepository,
  deleteCalendarEventRepository,
  getCalendarEventsRepository,
  updateCalendarEventRepository,
  type CalendarEventWriteInput,
} from "../Repository/CalendarEvent.repository.js";

export const getCalendarEventsServices = async (
  userId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    return await getCalendarEventsRepository(userId, fromDate, toDate);
  } catch (error) {
    console.log("error in CalendarEvent service Layer ", error);
    throw error;
  }
};

export const createCalendarEventServices = async (
  userId: string,
  payload: CalendarEventWriteInput,
) => {
  try {
    return await createCalendarEventRepository(userId, payload);
  } catch (error) {
    console.log("error in CalendarEvent service Layer ", error);
    throw error;
  }
};

export const updateCalendarEventServices = async (
  userId: string,
  eventId: string,
  payload: CalendarEventWriteInput,
) => {
  try {
    return await updateCalendarEventRepository(userId, eventId, payload);
  } catch (error) {
    console.log("error in CalendarEvent service Layer ", error);
    throw error;
  }
};

export const deleteCalendarEventServices = async (
  userId: string,
  eventId: string,
) => {
  try {
    return await deleteCalendarEventRepository(userId, eventId);
  } catch (error) {
    console.log("error in CalendarEvent service Layer ", error);
    throw error;
  }
};
