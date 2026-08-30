type ReminderLogEvent =
  | "reminder_created"
  | "reminder_scheduled"
  | "reminder_rescheduled"
  | "reminder_cancelled"
  | "reminder_schedule_failed";

export const logReminderEvent = (
  event: ReminderLogEvent,
  fields: Record<string, string | number | boolean | null | undefined>,
) => {
  const payload: Record<string, unknown> = { event, ...fields };
  console.log(JSON.stringify(payload));
};
