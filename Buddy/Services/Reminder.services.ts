import {
  createReminderRepository,
  deleteReminderRepository,
  getRemindersRepository,
  updateReminderRepository,
  type ReminderWriteInput,
} from "../Repository/Reminder.repository.js";

export const getRemindersServices = async (
  userId: string,
  limit?: number,
  cursor?: string,
  source?: string,
  dateFilter?: string,
  anchorDate?: string,
) => {
  try {
    return await getRemindersRepository(
      userId,
      limit,
      cursor,
      source,
      dateFilter,
      anchorDate,
    );
  } catch (error) {
    console.log("error in Reminder service Layer ", error);
    throw error;
  }
};

export const createReminderServices = async (
  userId: string,
  payload: ReminderWriteInput,
) => {
  try {
    return await createReminderRepository(userId, payload);
  } catch (error) {
    console.log("error in Reminder service Layer ", error);
    throw error;
  }
};

export const updateReminderServices = async (
  userId: string,
  reminderId: string,
  payload: ReminderWriteInput,
) => {
  try {
    return await updateReminderRepository(userId, reminderId, payload);
  } catch (error) {
    console.log("error in Reminder service Layer ", error);
    throw error;
  }
};

export const deleteReminderServices = async (
  userId: string,
  reminderId: string,
) => {
  try {
    return await deleteReminderRepository(userId, reminderId);
  } catch (error) {
    console.log("error in Reminder service Layer ", error);
    throw error;
  }
};
