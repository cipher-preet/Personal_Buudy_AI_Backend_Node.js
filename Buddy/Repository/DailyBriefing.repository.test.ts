import assert from "node:assert/strict";
import test from "node:test";
import {
  briefingOwnerFromAuth,
  mapBriefing,
  parseBriefingDateKey,
} from "./DailyBriefing.repository.js";

test("daily briefing owner comes from auth, never from client userId", () => {
  assert.equal(
    briefingOwnerFromAuth("auth-user-1", "attacker-user"),
    "auth-user-1",
  );
  assert.equal(briefingOwnerFromAuth(undefined, "attacker-user"), null);
});

test("briefing date query accepts YYYY-MM-DD or empty", () => {
  assert.deepEqual(parseBriefingDateKey(undefined), { value: undefined });
  assert.deepEqual(parseBriefingDateKey(""), { value: undefined });
  assert.deepEqual(parseBriefingDateKey("2026-09-10"), { value: "2026-09-10" });
  assert.equal(parseBriefingDateKey("10-09-2026").error, "Invalid 'date'. Use YYYY-MM-DD.");
});

test("mapBriefing strips internals and normalizes empty collections", () => {
  const mapped = mapBriefing({
    userId: "user-1",
    dateKey: "2026-09-10",
    timezone: "Asia/Kolkata",
    status: "SKIPPED",
    skipReason: "no_activity",
    highlights: [{ id: "h1", title: "Shipped", detail: "Report went out" }],
    people: ["Ada", ""],
    tasks: [{ id: "t1", title: "Follow up", meta: "Today" }],
    meetings: [{ id: "m1", time: "10:00 AM", title: "Standup", meta: "Office" }],
    insights: [
      {
        id: "i1",
        source: "Notes",
        sourceType: "note",
        title: "Budget",
        body: "Hold vendors",
        tags: ["Finance"],
      },
    ],
    sourceStats: { taskCount: 2 },
    error: "should not leak",
    missedCandidates: [{ id: "x", title: "hidden" }],
  });

  assert.equal(mapped.status, "SKIPPED");
  assert.equal(mapped.skipReason, "no_activity");
  assert.equal(mapped.highlights[0].title, "Shipped");
  assert.deepEqual(mapped.people, ["Ada"]);
  assert.equal(mapped.tasks[0].id, "t1");
  assert.equal(mapped.meetings[0].time, "10:00 AM");
  assert.equal(mapped.insights[0].title, "Budget");
  assert.equal(mapped.sourceStats.taskCount, 2);
  assert.equal(mapped.sourceStats.transcriptCount, 0);
  assert.equal("error" in mapped, false);
  assert.equal("missedCandidates" in mapped, false);
  assert.deepEqual(mapped.focus, []);
  assert.equal(mapped.stats.openTasks, 0);
  assert.equal(mapped.planDateKey, "");
});

test("mapBriefing exposes v2 plan fields", () => {
  const mapped = mapBriefing({
    userId: "user-1",
    dateKey: "2026-09-09",
    status: "READY",
    planDateKey: "2026-09-10",
    focus: [{ id: "focus-1", title: "Send deck", why: "Overdue", taskId: "t1" }],
    agenda: [{ id: "e1", kind: "meeting", time: "11:00 AM", title: "Client sync", prep: "Bring deck" }],
    risks: [{ id: "risks-1", title: "Overdue: Send deck" }],
    tasks: [{ id: "t1", title: "Send deck", priority: "high", dueStatus: "overdue", reason: "Promised Rahul" }],
    stats: { openTasks: 4, overdueTasks: "1" },
    sourceStats: { chatMessageCount: 3 },
  });

  assert.equal(mapped.planDateKey, "2026-09-10");
  assert.equal(mapped.focus[0].taskId, "t1");
  assert.equal(mapped.agenda[0].prep, "Bring deck");
  assert.equal(mapped.risks[0].title, "Overdue: Send deck");
  assert.equal(mapped.tasks[0].priority, "high");
  assert.equal(mapped.tasks[0].reason, "Promised Rahul");
  assert.equal(mapped.stats.overdueTasks, 1);
  assert.equal(mapped.stats.meetings, 0);
  assert.equal(mapped.sourceStats.chatMessageCount, 3);
});
