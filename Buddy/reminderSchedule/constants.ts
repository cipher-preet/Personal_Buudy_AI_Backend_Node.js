export const DELIVERY_TYPES = [
  "NORMAL_NOTIFICATION",
  "ALARM_NOTIFICATION",
  "AI_CALL",
] as const;

export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const DELIVERY_STATUSES = [
  "SCHEDULED",
  "TRIGGERING",
  "DELIVERED",
  "RETRY_PENDING",
  "FAILED",
  "CANCELLED",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DEFAULT_REMINDER_TIMEZONE = "Asia/Kolkata";

export const reminderRedisKeys = {
  schedule: process.env.REMINDER_SCHEDULE_KEY || "buddy:reminder:schedule",
  processing: process.env.REMINDER_PROCESSING_KEY || "buddy:reminder:processing",
  retry: process.env.REMINDER_RETRY_KEY || "buddy:reminder:retry",
  deadLetter: process.env.REMINDER_DEAD_LETTER_KEY || "buddy:reminder:dead-letter",
  payload: (occurrenceId: string) => `buddy:reminder:payload:${occurrenceId}`,
};

export const reminderScheduleConfig = {
  lateGraceSeconds: Number(process.env.REMINDER_LATE_GRACE_SECONDS || 300),
  payloadTtlSeconds: Number(process.env.REMINDER_PAYLOAD_TTL_SECONDS || 14 * 24 * 60 * 60),
};
