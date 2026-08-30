import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { Reminder } from "../Modals/Reminder.Modal.js";
import {
  cancelReminderSchedule,
  upsertReminderSchedule,
} from "../reminderSchedule/schedule.js";
import { logReminderEvent } from "../reminderSchedule/log.js";

const TONES = ["rose", "lavender", "ochre", "teal"] as const;
const REMINDER_CARD_FIELDS =
  "title description dateKey dateLabel timeLabel source tone repeat aiCalling notification beeping createdAt updatedAt";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const startOfWeekSunday = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
};

const buildDateKeyFilter = (dateFilter?: string, anchorDate?: string) => {
  if (!dateFilter || dateFilter === "all" || !anchorDate) {
    return undefined;
  }

  if (dateFilter === "today") {
    return anchorDate;
  }

  if (dateFilter === "tomorrow") {
    return addDaysToDateKey(anchorDate, 1);
  }

  if (dateFilter === "week") {
    const start = startOfWeekSunday(anchorDate);
    return {
      $gte: start,
      $lte: addDaysToDateKey(start, 6),
    };
  }

  return undefined;
};

const mapReminderCard = (reminder: Record<string, any>) => ({
  id: String(reminder._id),
  title: reminder.title ?? "",
  description: reminder.description ?? "",
  dateKey: reminder.dateKey ?? "",
  dateLabel: reminder.dateLabel ?? "",
  timeLabel: reminder.timeLabel ?? "",
  source: reminder.source === "ai" ? "ai" : "manual",
  tone: reminder.tone ?? "lavender",
  repeat: reminder.repeat ?? "once",
  aiCalling: Boolean(reminder.aiCalling),
  notification: reminder.notification !== false,
  beeping: Boolean(reminder.beeping),
  createdAt: reminder.createdAt ?? null,
  updatedAt: reminder.updatedAt ?? null,
});

const pickTone = () => TONES[Date.now() % TONES.length];

export type ReminderWriteInput = {
  title: string;
  description: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  repeat: string;
  aiCalling: boolean;
  notification: boolean;
  beeping: boolean;
  source?: "ai" | "manual";
  timeZone?: string;
};

const scheduleWrite = async (
  userId: string,
  reminderId: string,
  payload: ReminderWriteInput,
  previousOccurrenceId?: string | null,
) => {
  const fields = await upsertReminderSchedule({
    reminderId,
    userId,
    title: payload.title,
    description: payload.description,
    dateKey: payload.dateKey,
    timeLabel: payload.timeLabel,
    repeat: payload.repeat,
    aiCalling: payload.aiCalling,
    beeping: payload.beeping,
    notification: payload.notification,
    timeZone: payload.timeZone,
    previousOccurrenceId,
  });

  return {
    timezone: fields.timezone,
    deliveryType: fields.deliveryType,
    deliveryStatus: fields.deliveryStatus,
    nextTriggerAtUtc: fields.nextTriggerAtUtc,
    scheduledOccurrenceId: fields.scheduledOccurrenceId,
    retryCount: 0,
    retryAtUtc: null,
  };
};

export const getRemindersRepository = async (
  userId: string,
  limit = 20,
  cursor?: string,
  source?: string,
  dateFilter?: string,
  anchorDate?: string,
) => {
  try {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const query: Record<string, any> = {
      userId: createIdFilter(userId),
    };

    if (source === "ai" || source === "manual") {
      query.source = source;
    }

    const dateKeyFilter = buildDateKeyFilter(dateFilter, anchorDate);
    if (dateKeyFilter) {
      query.dateKey = dateKeyFilter;
    }

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

    const reminders = await Reminder.find(query)
      .select(REMINDER_CARD_FIELDS)
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean();

    const results = reminders.slice(0, pageSize);
    const nextCursor =
      reminders.length > pageSize && results.length > 0
        ? String(results[results.length - 1]._id)
        : null;

    return {
      status: STATUS_CODE.OK,
      data: {
        reminders: results.map(mapReminderCard),
        nextCursor,
      },
    };
  } catch (error) {
    console.log("error in Reminder repository Layer ", error);
    throw error;
  }
};

export const createReminderRepository = async (
  userId: string,
  payload: ReminderWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(userId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid user.",
      };
    }

    const created = await Reminder.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: payload.title,
      description: payload.description,
      dateKey: payload.dateKey,
      dateLabel: payload.dateLabel,
      timeLabel: payload.timeLabel,
      source: payload.source === "ai" ? "ai" : "manual",
      tone: pickTone(),
      repeat: payload.repeat,
      aiCalling: payload.aiCalling,
      notification: payload.notification,
      beeping: payload.beeping,
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to create reminder.",
      };
    }

    const scheduleFields = await scheduleWrite(
      userId,
      String(created._id),
      payload,
    );
    created.set(scheduleFields);
    await created.save();
    logReminderEvent("reminder_created", {
      reminderId: String(created._id),
      userId,
      reminderType: scheduleFields.deliveryType,
      scheduledTime: scheduleFields.nextTriggerAtUtc?.toISOString() ?? null,
    });

    return {
      status: STATUS_CODE.CREATED,
      message: "Reminder created successfully.",
      data: {
        reminder: mapReminderCard(created.toObject()),
      },
    };
  } catch (error) {
    console.log("error in Reminder repository Layer ", error);
    throw error;
  }
};

export const updateReminderRepository = async (
  userId: string,
  reminderId: string,
  payload: ReminderWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(reminderId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'reminderId' value.",
      };
    }

    const existing = await Reminder.findOne({
      _id: reminderId,
      userId: createIdFilter(userId),
    }).lean();

    if (!existing) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Reminder not found.",
      };
    }

    const previousOccurrenceId =
      typeof (existing as { scheduledOccurrenceId?: string | null })
        .scheduledOccurrenceId === "string"
        ? (existing as { scheduledOccurrenceId?: string }).scheduledOccurrenceId
        : null;

    const scheduleFields = await scheduleWrite(
      userId,
      reminderId,
      payload,
      previousOccurrenceId,
    );

    const updated = await Reminder.findOneAndUpdate(
      {
        _id: reminderId,
        userId: createIdFilter(userId),
      },
      {
        $set: {
          title: payload.title,
          description: payload.description,
          dateKey: payload.dateKey,
          dateLabel: payload.dateLabel,
          timeLabel: payload.timeLabel,
          repeat: payload.repeat,
          aiCalling: payload.aiCalling,
          notification: payload.notification,
          beeping: payload.beeping,
          ...scheduleFields,
        },
      },
      {
        new: true,
        projection: REMINDER_CARD_FIELDS,
      },
    ).lean();

    if (!updated) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Reminder not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Reminder updated successfully.",
      data: {
        reminder: mapReminderCard(updated),
      },
    };
  } catch (error) {
    console.log("error in Reminder repository Layer ", error);
    throw error;
  }
};

export const deleteReminderRepository = async (
  userId: string,
  reminderId: string,
) => {
  try {
    if (!mongoose.isValidObjectId(reminderId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'reminderId' value.",
      };
    }

    const deleted = await Reminder.findOneAndDelete({
      _id: reminderId,
      userId: createIdFilter(userId),
    });

    if (!deleted) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Reminder not found.",
      };
    }

    await cancelReminderSchedule(
      String(deleted._id),
      deleted.scheduledOccurrenceId ?? null,
    );

    return {
      status: STATUS_CODE.OK,
      message: "Reminder deleted successfully.",
      data: {
        deletedReminderId: String(deleted._id),
      },
    };
  } catch (error) {
    console.log("error in Reminder repository Layer ", error);
    throw error;
  }
};
