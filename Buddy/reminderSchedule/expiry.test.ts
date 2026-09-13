import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isReminderExpired } from "./time.js";

describe("isReminderExpired", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("marks past once reminders as expired", () => {
    assert.equal(
      isReminderExpired(
        {
          repeat: "once",
          dateKey: "2026-09-10",
          timeLabel: "9:00 AM",
          timeZone: "Asia/Kolkata",
        },
        now,
        300,
      ),
      true,
    );
  });

  it("keeps future once reminders active", () => {
    assert.equal(
      isReminderExpired(
        {
          repeat: "once",
          dateKey: "2026-09-20",
          timeLabel: "9:00 AM",
          timeZone: "Asia/Kolkata",
        },
        now,
        300,
      ),
      false,
    );
  });

  it("keeps repeating reminders alive even when original date is past", () => {
    assert.equal(
      isReminderExpired(
        {
          repeat: "daily",
          dateKey: "2026-01-01",
          timeLabel: "9:00 AM",
          timeZone: "Asia/Kolkata",
        },
        now,
        300,
      ),
      false,
    );
    assert.equal(
      isReminderExpired(
        {
          repeat: "weekly",
          dateKey: "2026-01-01",
          timeLabel: "9:00 AM",
          timeZone: "Asia/Kolkata",
        },
        now,
        300,
      ),
      false,
    );
  });
});
