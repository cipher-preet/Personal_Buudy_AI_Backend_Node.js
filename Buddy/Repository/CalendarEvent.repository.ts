import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { CalendarEvent } from "../Modals/CalendarEvent.Modal.js";
import { Reminder } from "../Modals/Reminder.Modal.js";
import {
  cancelReminderSchedule,
  upsertReminderSchedule,
} from "../reminderSchedule/schedule.js";

const TONES = ["indigo", "violet", "cyan", "teal"] as const;
const TIMELINE_PAD_HOURS = 2;
const EVENT_CARD_FIELDS =
  "title description location dateKey dateLabel startTimeLabel endTimeLabel tone aiReminder aiCalling notification beeping reminderId createdAt updatedAt";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

const mapEventCard = (event: Record<string, any>) => ({
  id: String(event._id),
  title: event.title ?? "",
  description: event.description ?? "",
  location: event.location ?? "",
  dateKey: event.dateKey ?? "",
  dateLabel: event.dateLabel ?? "",
  startTimeLabel: event.startTimeLabel ?? "",
  endTimeLabel: event.endTimeLabel ?? "",
  tone: TONES.includes(event.tone) ? event.tone : "indigo",
  aiReminder: Boolean(event.aiReminder),
  aiCalling: Boolean(event.aiCalling),
  notification: event.notification !== false,
  beeping: Boolean(event.beeping),
  reminderId: event.reminderId ? String(event.reminderId) : null,
  createdAt: event.createdAt ?? null,
  updatedAt: event.updatedAt ?? null,
});

const pickTone = () => TONES[Date.now() % TONES.length];

const hoursFromTimeLabel = (label: string) => {
  const match = (label || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour < 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return hour + minute / 60;
};

const normalizeRange = (startLabel: string, endLabel: string) => {
  const start = hoursFromTimeLabel(startLabel) ?? 9;
  let end = hoursFromTimeLabel(endLabel) ?? start + 1;
  if (end <= start) {
    end = start >= 12 && end < 12 ? end + 24 : start + 1;
  }
  return { start, end };
};

const buildDayWindows = (
  events: Array<{
    dateKey: string;
    startTimeLabel: string;
    endTimeLabel: string;
  }>,
) => {
  const byDay = new Map<string, { earliest: number; latest: number }>();

  for (const event of events) {
    const { start, end } = normalizeRange(
      event.startTimeLabel,
      event.endTimeLabel,
    );
    const current = byDay.get(event.dateKey);
    if (!current) {
      byDay.set(event.dateKey, { earliest: start, latest: end });
      continue;
    }
    current.earliest = Math.min(current.earliest, start);
    current.latest = Math.max(current.latest, end);
  }

  const windows: Record<string, { startHour: number; endHour: number }> = {};
  for (const [dateKey, { earliest, latest }] of byDay) {
    const startHour = Math.max(0, Math.floor(earliest) - TIMELINE_PAD_HOURS);
    const endHour = Math.min(
      24,
      Math.max(startHour + 1, Math.ceil(latest) + TIMELINE_PAD_HOURS),
    );
    windows[dateKey] = { startHour, endHour };
  }

  return windows;
};

const reminderPayloadFromEvent = (payload: CalendarEventWriteInput) => ({
  title: payload.title,
  description: payload.description || `Meeting: ${payload.title}`,
  dateKey: payload.dateKey,
  dateLabel: payload.dateLabel,
  timeLabel: payload.startTimeLabel,
  source: "manual" as const,
  tone: "lavender",
  repeat: "once",
  aiCalling: payload.aiCalling,
  notification: payload.notification,
  beeping: payload.beeping,
});

const syncLinkedReminder = async (
  userId: string,
  payload: CalendarEventWriteInput,
  reminderId?: string | null,
) => {
  if (!payload.aiReminder) {
    if (reminderId && mongoose.isValidObjectId(reminderId)) {
      const deleted = await Reminder.findOneAndDelete({
        _id: reminderId,
        userId: createIdFilter(userId),
      });
      if (deleted) {
        await cancelReminderSchedule(
          String(deleted._id),
          deleted.scheduledOccurrenceId ?? null,
        );
      }
    }
    return null;
  }

  const reminderBody = reminderPayloadFromEvent(payload);

  if (reminderId && mongoose.isValidObjectId(reminderId)) {
    const existing = await Reminder.findOne({
      _id: reminderId,
      userId: createIdFilter(userId),
    });

    if (existing) {
      const scheduleFields = await upsertReminderSchedule({
        reminderId: String(existing._id),
        userId,
        title: reminderBody.title,
        description: reminderBody.description,
        dateKey: reminderBody.dateKey,
        timeLabel: reminderBody.timeLabel,
        repeat: reminderBody.repeat,
        aiCalling: reminderBody.aiCalling,
        beeping: reminderBody.beeping,
        notification: reminderBody.notification,
        previousOccurrenceId: existing.scheduledOccurrenceId ?? null,
      });
      existing.set({
        ...reminderBody,
        timezone: scheduleFields.timezone,
        deliveryType: scheduleFields.deliveryType,
        deliveryStatus: scheduleFields.deliveryStatus,
        nextTriggerAtUtc: scheduleFields.nextTriggerAtUtc,
        scheduledOccurrenceId: scheduleFields.scheduledOccurrenceId,
        retryCount: 0,
        retryAtUtc: null,
      });
      await existing.save();
      return String(existing._id);
    }
  }

  const created = await Reminder.create({
    userId: new mongoose.Types.ObjectId(userId),
    ...reminderBody,
  });

  if (!created?._id) {
    return null;
  }

  const scheduleFields = await upsertReminderSchedule({
    reminderId: String(created._id),
    userId,
    title: reminderBody.title,
    description: reminderBody.description,
    dateKey: reminderBody.dateKey,
    timeLabel: reminderBody.timeLabel,
    repeat: reminderBody.repeat,
    aiCalling: reminderBody.aiCalling,
    beeping: reminderBody.beeping,
    notification: reminderBody.notification,
  });
  created.set({
    timezone: scheduleFields.timezone,
    deliveryType: scheduleFields.deliveryType,
    deliveryStatus: scheduleFields.deliveryStatus,
    nextTriggerAtUtc: scheduleFields.nextTriggerAtUtc,
    scheduledOccurrenceId: scheduleFields.scheduledOccurrenceId,
    retryCount: 0,
    retryAtUtc: null,
  });
  await created.save();
  return String(created._id);
};

export type CalendarEventWriteInput = {
  title: string;
  description: string;
  location: string;
  dateKey: string;
  dateLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  aiReminder: boolean;
  aiCalling: boolean;
  notification: boolean;
  beeping: boolean;
};

export const getCalendarEventsRepository = async (
  userId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    const events = await CalendarEvent.find({
      userId: createIdFilter(userId),
      dateKey: { $gte: fromDate, $lte: toDate },
    })
      .select(EVENT_CARD_FIELDS)
      .sort({ dateKey: 1, startTimeLabel: 1, _id: 1 })
      .lean();

    const mapped = events.map(mapEventCard).sort((first, second) => {
      if (first.dateKey !== second.dateKey) {
        return first.dateKey.localeCompare(second.dateKey);
      }
      const startA = normalizeRange(first.startTimeLabel, first.endTimeLabel).start;
      const startB = normalizeRange(second.startTimeLabel, second.endTimeLabel).start;
      return startA - startB;
    });

    return {
      status: STATUS_CODE.OK,
      data: {
        events: mapped,
        windows: buildDayWindows(mapped),
      },
    };
  } catch (error) {
    console.log("error in CalendarEvent repository Layer ", error);
    throw error;
  }
};

export const createCalendarEventRepository = async (
  userId: string,
  payload: CalendarEventWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(userId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid user.",
      };
    }

    const reminderId = await syncLinkedReminder(userId, payload);

    const created = await CalendarEvent.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: payload.title,
      description: payload.description,
      location: payload.location,
      dateKey: payload.dateKey,
      dateLabel: payload.dateLabel,
      startTimeLabel: payload.startTimeLabel,
      endTimeLabel: payload.endTimeLabel,
      tone: pickTone(),
      aiReminder: payload.aiReminder,
      aiCalling: payload.aiCalling,
      notification: payload.notification,
      beeping: payload.beeping,
      reminderId,
    });

    if (!created) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Failed to create event.",
      };
    }

    return {
      status: STATUS_CODE.CREATED,
      message: "Event created successfully.",
      data: {
        event: mapEventCard(created.toObject()),
      },
    };
  } catch (error) {
    console.log("error in CalendarEvent repository Layer ", error);
    throw error;
  }
};

export const updateCalendarEventRepository = async (
  userId: string,
  eventId: string,
  payload: CalendarEventWriteInput,
) => {
  try {
    if (!mongoose.isValidObjectId(eventId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'eventId' value.",
      };
    }

    const existing = await CalendarEvent.findOne({
      _id: eventId,
      userId: createIdFilter(userId),
    }).lean();

    if (!existing) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Event not found.",
      };
    }

    const reminderId = await syncLinkedReminder(
      userId,
      payload,
      existing.reminderId ? String(existing.reminderId) : null,
    );

    const updated = await CalendarEvent.findOneAndUpdate(
      {
        _id: eventId,
        userId: createIdFilter(userId),
      },
      {
        $set: {
          title: payload.title,
          description: payload.description,
          location: payload.location,
          dateKey: payload.dateKey,
          dateLabel: payload.dateLabel,
          startTimeLabel: payload.startTimeLabel,
          endTimeLabel: payload.endTimeLabel,
          aiReminder: payload.aiReminder,
          aiCalling: payload.aiCalling,
          notification: payload.notification,
          beeping: payload.beeping,
          reminderId,
        },
      },
      {
        new: true,
        projection: EVENT_CARD_FIELDS,
      },
    ).lean();

    if (!updated) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Event not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Event updated successfully.",
      data: {
        event: mapEventCard(updated),
      },
    };
  } catch (error) {
    console.log("error in CalendarEvent repository Layer ", error);
    throw error;
  }
};

export const deleteCalendarEventRepository = async (
  userId: string,
  eventId: string,
) => {
  try {
    if (!mongoose.isValidObjectId(eventId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid 'eventId' value.",
      };
    }

    const deleted = await CalendarEvent.findOneAndDelete({
      _id: eventId,
      userId: createIdFilter(userId),
    });

    if (!deleted) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Event not found.",
      };
    }

    if (deleted.reminderId) {
      const reminder = await Reminder.findOneAndDelete({
        _id: deleted.reminderId,
        userId: createIdFilter(userId),
      });
      if (reminder) {
        await cancelReminderSchedule(
          String(reminder._id),
          reminder.scheduledOccurrenceId ?? null,
        );
      }
    }

    return {
      status: STATUS_CODE.OK,
      message: "Event deleted successfully.",
      data: {
        deletedEventId: String(deleted._id),
      },
    };
  } catch (error) {
    console.log("error in CalendarEvent repository Layer ", error);
    throw error;
  }
};
