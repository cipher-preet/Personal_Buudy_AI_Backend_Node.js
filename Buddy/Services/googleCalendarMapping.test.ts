import test from "node:test";
import assert from "node:assert/strict";
import { mapGoogleEvent } from "./GoogleCalendar.services.js";

const TZ = "Asia/Kolkata";

test("timed event converts to the user's timezone", () => {
  const [row] = mapGoogleEvent(
    {
      id: "evt1",
      summary: "Standup",
      start: { dateTime: "2026-10-05T04:00:00Z" },
      end: { dateTime: "2026-10-05T04:30:00Z" },
    },
    "primary",
    TZ,
  );
  assert.equal(row.externalId, "evt1");
  assert.equal(row.dateKey, "2026-10-05");
  assert.equal(row.startTimeLabel, "9:30 AM");
  assert.equal(row.endTimeLabel, "10:00 AM");
  assert.equal(row.allDay, false);
  assert.equal(row.dateLabel, "5 Oct 2026");
});

test("event crossing midnight is clipped to the start day", () => {
  const [row] = mapGoogleEvent(
    {
      id: "late",
      summary: "Release",
      start: { dateTime: "2026-10-05T17:30:00Z" },
      end: { dateTime: "2026-10-05T19:30:00Z" },
    },
    "primary",
    TZ,
  );
  assert.equal(row.dateKey, "2026-10-05");
  assert.equal(row.startTimeLabel, "11:00 PM");
  assert.equal(row.endTimeLabel, "11:59 PM");
});

test("multi-day all-day event becomes one row per day", () => {
  const rows = mapGoogleEvent(
    { id: "trip", summary: "Offsite", start: { date: "2026-10-05" }, end: { date: "2026-10-08" } },
    "primary",
    TZ,
  );
  assert.deepEqual(
    rows.map((row) => row.externalId),
    ["trip:2026-10-05", "trip:2026-10-06", "trip:2026-10-07"],
  );
  assert.ok(rows.every((row) => row.allDay));
});

test("cancelled, declined and working-location events are skipped", () => {
  const start = { dateTime: "2026-10-05T04:00:00Z" };
  assert.equal(mapGoogleEvent({ id: "a", status: "cancelled", start }, "primary", TZ).length, 0);
  assert.equal(
    mapGoogleEvent(
      { id: "b", start, attendees: [{ self: true, responseStatus: "declined" }] },
      "primary",
      TZ,
    ).length,
    0,
  );
  assert.equal(
    mapGoogleEvent({ id: "c", eventType: "workingLocation", start: { date: "2026-10-05" } }, "primary", TZ)
      .length,
    0,
  );
});

test("html description is flattened and long titles are clipped", () => {
  const [row] = mapGoogleEvent(
    {
      id: "d",
      summary: "x".repeat(120),
      description: "<p>Agenda<br>1. Plan &amp; ship</p>",
      start: { dateTime: "2026-10-05T04:00:00Z" },
    },
    "primary",
    TZ,
  );
  assert.equal(row.title.length, 80);
  assert.equal(row.description, "Agenda\n1. Plan & ship");
  assert.equal(row.endTimeLabel, "10:00 AM");
});
