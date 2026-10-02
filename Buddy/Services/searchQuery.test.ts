import assert from "node:assert/strict";
import test from "node:test";
import { buildSnippet, parseSearchQuery, scoreSearchMatch } from "./searchQuery.js";

// Thursday 1 Oct 2026, 10:00 IST
const now = new Date("2026-10-01T04:30:00.000Z");
const parse = (q: string) => parseSearchQuery(q, { now, timeZone: "Asia/Kolkata" });

test("plain keywords drop stopwords and keep order", () => {
  const parsed = parse("Show the budget review for marketing");
  assert.deepEqual(parsed.terms, ["budget", "review", "marketing"]);
  assert.deepEqual(parsed.types, []);
  assert.equal(parsed.dateRange, null);
});

test("type words become filters", () => {
  const parsed = parse("meetings about pricing");
  assert.deepEqual(parsed.types, ["meeting"]);
  assert.deepEqual(parsed.terms, ["pricing"]);
  assert.deepEqual(parse("type:note design").types, ["note"]);
});

test("relative dates resolve in the user's timezone", () => {
  assert.deepEqual(parse("notes yesterday").dateRange, {
    from: "2026-09-30",
    to: "2026-09-30",
    label: "Yesterday",
  });
  assert.equal(parse("today").dateRange?.from, "2026-10-01");
  assert.deepEqual(
    { from: parse("tasks this week").dateRange?.from, to: parse("tasks this week").dateRange?.to },
    { from: "2026-09-28", to: "2026-10-04" },
  );
  assert.deepEqual(
    { from: parse("last month").dateRange?.from, to: parse("last month").dateRange?.to },
    { from: "2026-09-01", to: "2026-09-30" },
  );
  assert.equal(parse("standup monday").dateRange?.from, "2026-09-28");
  assert.equal(parse("next monday").dateRange?.from, "2026-10-05");
  assert.equal(parse("last 7 days").dateRange?.from, "2026-09-25");
});

test("absolute dates in several formats", () => {
  assert.equal(parse("2026-09-15").dateRange?.from, "2026-09-15");
  assert.equal(parse("15/09/2026 sync").dateRange?.from, "2026-09-15");
  assert.equal(parse("sync 15 sep").dateRange?.from, "2026-09-15");
  assert.equal(parse("sep 15th notes").dateRange?.from, "2026-09-15");
  assert.deepEqual(parse("sync 15 sep").terms, ["sync"]);
  const month = parse("meetings in august");
  assert.deepEqual({ from: month.dateRange?.from, to: month.dateRange?.to }, { from: "2026-08-01", to: "2026-08-31" });
  assert.equal(parse("may need review").dateRange, null);
});

test("times, statuses and priorities", () => {
  const parsed = parse("client call at 3pm tomorrow");
  assert.equal(parsed.timeMinutes, 15 * 60);
  assert.equal(parsed.timeLabel, "3:00 PM");
  assert.equal(parsed.dateRange?.from, "2026-10-02");
  assert.deepEqual(parsed.terms, ["client"]);
  assert.equal(parse("15:30 review").timeMinutes, 15 * 60 + 30);

  const overdue = parse("overdue urgent invoices");
  assert.equal(overdue.status, "overdue");
  assert.equal(overdue.priority, "high");
  assert.deepEqual(overdue.types, ["task"]);
  assert.deepEqual(overdue.terms, ["invoices"]);
});

test("title matches outrank body matches", () => {
  const base = { terms: ["budget"], phrase: "budget", ageDays: 1 };
  const inTitle = scoreSearchMatch({ ...base, title: "Budget plan", body: "" });
  const inBody = scoreSearchMatch({ ...base, title: "Plan", body: "about the budget" });
  assert.ok(inTitle.score > inBody.score);
  assert.equal(inTitle.matchedTerms, 1);
  assert.equal(scoreSearchMatch({ ...base, title: "Other", body: "none" }).matchedTerms, 0);
});

test("snippet centres on the first hit", () => {
  const text = `${"lorem ipsum ".repeat(20)}the quarterly budget is approved ${"dolor ".repeat(20)}`;
  const snippet = buildSnippet(text, ["budget"]);
  assert.ok(snippet.startsWith("…"));
  assert.ok(snippet.includes("budget"));
});
