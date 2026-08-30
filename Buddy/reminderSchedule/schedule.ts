import {
  DEFAULT_REMINDER_TIMEZONE,
  reminderRedisKeys,
  reminderScheduleConfig,
  type DeliveryStatus,
  type DeliveryType,
} from "./constants.js";
import { deliveryTypeFromFlags } from "./delivery.js";
import { logReminderEvent } from "./log.js";
import { connectReminderRedis } from "./redisClient.js";
import {
  computeNextTriggerAtUtc,
  occurrenceIdFor,
  toOccurrenceUtcKey,
} from "./time.js";

export type ReminderScheduleInput = {
  reminderId: string;
  userId: string;
  title: string;
  description: string;
  dateKey: string;
  timeLabel: string;
  repeat: string;
  aiCalling: boolean;
  beeping: boolean;
  notification: boolean;
  timeZone?: string;
  previousOccurrenceId?: string | null;
};

export type ReminderScheduleFields = {
  timezone: string;
  deliveryType: DeliveryType | null;
  deliveryStatus: DeliveryStatus;
  nextTriggerAtUtc: Date | null;
  scheduledOccurrenceId: string | null;
  retryCount: number;
};

export const buildScheduleFields = (
  input: Omit<ReminderScheduleInput, "reminderId" | "userId" | "title" | "description" | "previousOccurrenceId">,
  now = new Date(),
): ReminderScheduleFields => {
  const timezone = input.timeZone?.trim() || DEFAULT_REMINDER_TIMEZONE;
  const deliveryType = deliveryTypeFromFlags(input);
  if (!deliveryType) {
    return {
      timezone,
      deliveryType: null,
      deliveryStatus: "CANCELLED",
      nextTriggerAtUtc: null,
      scheduledOccurrenceId: null,
      retryCount: 0,
    };
  }

  const nextTriggerAtUtc = computeNextTriggerAtUtc({
    dateKey: input.dateKey,
    timeLabel: input.timeLabel,
    timeZone: timezone,
    repeat: input.repeat,
    after: new Date(now.getTime() - reminderScheduleConfig.lateGraceSeconds * 1000),
  });

  if (!nextTriggerAtUtc) {
    return {
      timezone,
      deliveryType,
      deliveryStatus: "FAILED",
      nextTriggerAtUtc: null,
      scheduledOccurrenceId: null,
      retryCount: 0,
    };
  }

  const tooLate =
    nextTriggerAtUtc.getTime() <
    now.getTime() - reminderScheduleConfig.lateGraceSeconds * 1000;
  if (tooLate && input.repeat === "once") {
    return {
      timezone,
      deliveryType,
      deliveryStatus: "FAILED",
      nextTriggerAtUtc,
      scheduledOccurrenceId: null,
      retryCount: 0,
    };
  }

  return {
    timezone,
    deliveryType,
    deliveryStatus: "SCHEDULED",
    nextTriggerAtUtc,
    scheduledOccurrenceId: null,
    retryCount: 0,
  };
};

const reminderPayload = (
  input: ReminderScheduleInput,
  occurrenceAtUtc: Date,
  deliveryType: DeliveryType,
) => ({
  version: 1,
  eventId: occurrenceIdFor(input.reminderId, occurrenceAtUtc),
  reminderId: input.reminderId,
  userId: input.userId,
  occurrenceAtUtc: toOccurrenceUtcKey(occurrenceAtUtc),
  timezone: input.timeZone?.trim() || DEFAULT_REMINDER_TIMEZONE,
  type: deliveryType,
  title: input.title,
  message: input.description,
  createdAt: new Date().toISOString(),
});

export const cancelReminderSchedule = async (
  reminderId: string,
  occurrenceId?: string | null,
) => {
  const redis = await connectReminderRedis();
  if (!redis || !occurrenceId) {
    if (occurrenceId) {
      logReminderEvent("reminder_cancelled", { reminderId, occurrenceId });
    }
    return;
  }

  try {
    await redis
      .multi()
      .zrem(reminderRedisKeys.schedule, occurrenceId)
      .zrem(reminderRedisKeys.processing, occurrenceId)
      .zrem(reminderRedisKeys.retry, occurrenceId)
      .del(reminderRedisKeys.payload(occurrenceId))
      .exec();
    logReminderEvent("reminder_cancelled", { reminderId, occurrenceId });
  } catch (error: any) {
    logReminderEvent("reminder_schedule_failed", {
      reminderId,
      occurrenceId,
      message: error?.message || "Redis cancel failed",
    });
  }
};

export const upsertReminderSchedule = async (input: ReminderScheduleInput) => {
  const fields = buildScheduleFields(input);
  const reminderId = input.reminderId;

  if (input.previousOccurrenceId && input.previousOccurrenceId !== fields.scheduledOccurrenceId) {
    await cancelReminderSchedule(reminderId, input.previousOccurrenceId);
  }

  if (
    !fields.deliveryType ||
    !fields.nextTriggerAtUtc ||
    fields.deliveryStatus !== "SCHEDULED"
  ) {
    return fields;
  }

  const occurrenceId = occurrenceIdFor(input.reminderId, fields.nextTriggerAtUtc);
  fields.scheduledOccurrenceId = occurrenceId;
  const redis = await connectReminderRedis();
  if (!redis) {
    logReminderEvent("reminder_schedule_failed", {
      reminderId,
      occurrenceId,
      message: "REMINDER_REDIS_URL is not configured",
    });
    return fields;
  }

  try {
    const score = Math.floor(fields.nextTriggerAtUtc.getTime() / 1000);
    const payload = JSON.stringify(
      reminderPayload(input, fields.nextTriggerAtUtc, fields.deliveryType),
    );
    await redis
      .multi()
      .zadd(reminderRedisKeys.schedule, score, occurrenceId)
      .set(
        reminderRedisKeys.payload(occurrenceId),
        payload,
        "EX",
        reminderScheduleConfig.payloadTtlSeconds,
      )
      .exec();
    logReminderEvent(
      input.previousOccurrenceId ? "reminder_rescheduled" : "reminder_scheduled",
      {
        reminderId,
        userId: input.userId,
        occurrenceId,
        reminderType: fields.deliveryType,
        scheduledTime: toOccurrenceUtcKey(fields.nextTriggerAtUtc),
      },
    );
  } catch (error: any) {
    logReminderEvent("reminder_schedule_failed", {
      reminderId,
      occurrenceId,
      message: error?.message || "Redis schedule failed",
    });
  }

  return fields;
};
