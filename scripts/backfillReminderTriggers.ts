/**
 * One-time backfill: compute nextTriggerAtUtc for existing reminders
 * without changing dateKey/timeLabel. Does not fire past one-time reminders
 * outside the late-delivery grace window.
 *
 * Usage from Node_Backend:
 *   npx tsx scripts/backfillReminderTriggers.ts
 */
import dotenv from "dotenv";

dotenv.config();

import connectDB from "../Config/db.js";
import { Reminder } from "../Buddy/Modals/Reminder.Modal.js";
import { upsertReminderSchedule } from "../Buddy/reminderSchedule/schedule.js";

const run = async () => {
  await connectDB();
  const cursor = Reminder.find({
    $or: [
      { nextTriggerAtUtc: { $exists: false } },
      { nextTriggerAtUtc: null },
      { scheduledOccurrenceId: { $exists: false } },
      { scheduledOccurrenceId: null },
    ],
  }).cursor();

  let scanned = 0;
  let scheduled = 0;

  for await (const reminder of cursor) {
    scanned += 1;
    const fields = await upsertReminderSchedule({
      reminderId: String(reminder._id),
      userId: String(reminder.userId),
      title: reminder.title,
      description: reminder.description,
      dateKey: reminder.dateKey,
      timeLabel: reminder.timeLabel,
      repeat: reminder.repeat,
      aiCalling: Boolean(reminder.aiCalling),
      beeping: Boolean(reminder.beeping),
      notification: reminder.notification !== false,
      timeZone: reminder.timezone,
      previousOccurrenceId: reminder.scheduledOccurrenceId ?? null,
    });
    reminder.set({
      timezone: fields.timezone,
      deliveryType: fields.deliveryType,
      deliveryStatus: fields.deliveryStatus,
      nextTriggerAtUtc: fields.nextTriggerAtUtc,
      scheduledOccurrenceId: fields.scheduledOccurrenceId,
    });
    await reminder.save();
    if (fields.scheduledOccurrenceId) {
      scheduled += 1;
    }
  }

  console.log(
    JSON.stringify({
      event: "reminder_backfill_complete",
      scanned,
      scheduled,
    }),
  );
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
