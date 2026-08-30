import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zonedLocalToUtc, computeNextTriggerAtUtc, toOccurrenceUtcKey } from "./time.js";

describe("zonedLocalToUtc", () => {
  it("converts Asia/Kolkata 3:30 PM to 10:00 UTC", () => {
    const value = zonedLocalToUtc("2026-08-30", "3:30 PM", "Asia/Kolkata");
    assert.ok(value);
    assert.equal(toOccurrenceUtcKey(value), "2026-08-30T10:00:00Z");
  });

  it("converts UTC noon", () => {
    const value = zonedLocalToUtc("2026-08-30", "12:00 PM", "UTC");
    assert.ok(value);
    assert.equal(toOccurrenceUtcKey(value), "2026-08-30T12:00:00Z");
  });
});

describe("computeNextTriggerAtUtc", () => {
  it("returns the first future daily occurrence after a past time", () => {
    const after = new Date("2026-08-30T10:00:00Z");
    const value = computeNextTriggerAtUtc({
      dateKey: "2026-08-30",
      timeLabel: "3:00 PM",
      timeZone: "Asia/Kolkata",
      repeat: "daily",
      after,
    });
    assert.ok(value);
    assert.equal(toOccurrenceUtcKey(value), "2026-08-31T09:30:00Z");
  });
});
