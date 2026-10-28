import assert from "node:assert/strict";
import test from "node:test";

import { clarifyStoredPlan, isClearAction, repairThinStoredPlan } from "./stepClarity.js";

const projectPlan = () => {
  const rows = [
    ["Scope Sign-off", "Scope Statement signed by client and internal sponsor"],
    ["Planning Completion", "WBS, effort estimates, resource capacity plan, risk register and 20-day schedule approved"],
    ["Project Launch", "Kickoff meeting held, communication plan distributed"],
    ["Mid-project Review", "Progress vs. schedule reviewed, schedule re-baselined if needed, risk register updated"],
    ["Final Delivery Sign-off", "Client acceptance sign-off obtained, hand-over package delivered"],
  ];
  return {
    days: rows.map(([title, outcome], index) => ({
      id: `day-${index + 1}`,
      dayIndex: index + 1,
      title,
      scheduledDate: `2026-10-${String(26 + index).padStart(2, "0")}`,
      focus: `Do the work for “${outcome}” and save something you can open again.`,
      tasks: [
        {
          id: `${index + 1}-old`,
          text: `Do the work for “${outcome}” and save something you can open again.`,
          done: false,
        },
      ],
    })),
  };
};

const blob = (plan: { days: Array<{ title: string; tasks: Array<{ text: string }> }> }) =>
  plan.days
    .flatMap((day) => [day.title, ...day.tasks.map((task) => task.text)])
    .join(" ")
    .toLowerCase();

test("a stored plan is not rewritten by a local template", () => {
  const plan = {
    days: [
      {
        id: "day-1",
        title: "Scope Sign-off",
        tasks: [{ id: "day-1-t1", text: "Scope statement signed by the client", done: false }],
      },
    ],
  };
  const result = clarifyStoredPlan(plan);
  assert.equal(result.changed, false);
  const day = (result.plan.days as Array<{ tasks: Array<{ text: string }> }>)[0];
  assert.equal(day.tasks[0].text, "Scope statement signed by the client");
});

test("a project plan is not expanded by a local checklist", () => {
  const first = clarifyStoredPlan(projectPlan());
  assert.equal(first.changed, false);
  const plan = first.plan as ReturnType<typeof projectPlan>;
  assert.equal(plan.days[0].tasks.length, 1);
  assert.match(blob(plan), /do the work for/);
});

test("real actions stay as written", () => {
  const result = clarifyStoredPlan({
    days: [
      {
        id: "day-1",
        title: "Audit + scope freeze",
        tasks: [
          { id: "d1-t1", text: "Smoke-test the core journey for the meeting notes app", why: "Find the breaks first." },
          { id: "d1-t2", text: "Write a P0/P1/P2 backlog of launch blockers", why: "The list is what you fix next." },
        ],
      },
    ],
  });
  const day = (result.plan.days as Array<{ tasks: Array<{ id: string; text: string }> }>)[0];
  assert.deepEqual(
    day.tasks.map((task) => task.text),
    ["Smoke-test the core journey for the meeting notes app", "Write a P0/P1/P2 backlog of launch blockers"],
  );
  assert.equal(day.tasks[0].id, "d1-t1");
});

const PHASE = "This phase’s outcome is completed and can be shown";

test("a phase-outcome sentence is left for the model", () => {
  const first = clarifyStoredPlan({
    days: [
      {
        id: "day-1",
        title: "Week 1-2: Language Fundamentals",
        tasks: [{ id: "old", text: PHASE, done: false }],
      },
    ],
  });
  assert.equal(first.changed, false);
  const day = (first.plan.days as Array<{ tasks: Array<{ text: string }> }>)[0];
  assert.equal(day.tasks[0].text, PHASE);
});

const skillGoal = (level: string, hours: number) => ({
  title: "Learn a skill",
  statement: "I want to learn a skill",
  description: "watercolor painting",
  goalType: "skill",
  timeframe: "2 months",
  availableHoursPerWeek: hours,
  contextProfile: { startingLevel: level, description: "watercolor painting" },
});

const cannedPlan = () => ({
  coachNote: "Answer the Platform Preference Survey to determine the learning path.",
  immediateNextStep: "Answer the Platform Preference Survey to determine the learning path.",
  days: [
    {
      id: "day-1",
      dayIndex: 1,
      title: "Week 1-2: Language Fundamentals",
      scheduleDay: 1,
      focus: PHASE,
      status: "open",
      tasks: [{ id: "old", text: PHASE, done: false }],
    },
  ],
});

const assertSpread = (plan: {
  horizonDays?: number;
  coachNote?: string;
  immediateNextStep?: string;
  days: Array<{ scheduleDay?: number; title: string; tasks: Array<{ id: string; text: string }> }>;
}, hours: string, started: boolean) => {
  assert.ok(plan.days.length >= 6 && plan.days.length <= 10);
  assert.equal(plan.horizonDays, 60);
  const slots = plan.days.map((day) => Number(day.scheduleDay));
  assert.equal(slots[0], 1);
  assert.equal(slots[slots.length - 1], 60);
  assert.deepEqual(slots, [...slots].sort((left, right) => left - right));
  assert.equal(new Set(slots).size, slots.length);
  const text = [plan.coachNote, plan.immediateNextStep, ...plan.days.flatMap((day) => [day.title, ...day.tasks.map((task) => task.text)])]
    .join(" ")
    .toLowerCase();
  assert.match(text, /watercolor/);
  assert.equal(text.includes("language fundamentals"), false);
  assert.equal(text.includes("platform preference"), false);
  assert.equal(text.includes("can be shown"), false);
  assert.equal(text.includes(hours), true);
  if (started) {
    assert.equal(text.includes("fundamentals"), false);
    assert.equal(text.includes("cannot do yet"), false);
  } else {
    assert.match(text, /cannot do yet|where you are/);
    assert.match(text, /fundamentals/);
  }
  for (const day of plan.days) {
    assert.ok(day.tasks.length >= 2 && day.tasks.length <= 4);
    const named = day.tasks.filter((task) => task.text.toLowerCase().includes("watercolor")).length;
    assert.ok(named >= 2);
    for (const task of day.tasks) assert.equal(isClearAction(task.text, day.title), true);
  }
};

test("a thin plan is not replaced with a local course", () => {
  const first = repairThinStoredPlan(cannedPlan(), skillGoal("From zero", 5));
  assert.equal(first.changed, false);
  const plan = first.plan as { days: Array<{ title: string }> };
  assert.equal(plan.days.length, 1);
  assert.match(plan.days[0].title, /Language Fundamentals/);
});

test("an existing plan is not sent back through beginner drills", () => {
  const result = repairThinStoredPlan(cannedPlan(), skillGoal("I already use it", 4));
  assert.equal(result.changed, false);
  assert.equal((result.plan as { days: unknown[] }).days.length, 1);
});

test("a specific multi-step plan is kept", () => {
  const plan = {
    horizonDays: 60,
    days: [1, 2, 3].map((index) => ({
      id: `keep-${index}`,
      dayIndex: index,
      scheduleDay: index === 3 ? 60 : index * 20,
      title: `Watercolor painting session ${index}`,
      tasks: [
        { id: `a${index}`, text: `Practice watercolor painting on a still life for session ${index}.` },
        { id: `b${index}`, text: `Review the watercolor painting from session ${index} and write what changed.` },
      ],
    })),
  };
  const result = repairThinStoredPlan(plan, skillGoal("Some practice", 5));
  assert.equal(result.changed, false);
  const days = (result.plan as typeof plan).days;
  assert.equal(days.length, 3);
  assert.equal(days[0].tasks[0].id, "a1");
  assert.equal(days[2].scheduleDay, 60);
});

test("a completed step is not rewritten", () => {
  const plan = cannedPlan();
  plan.days[0].status = "done";
  (plan.days[0] as { completedOn?: string }).completedOn = "2026-10-28";
  const result = repairThinStoredPlan(plan, skillGoal("From zero", 5));
  assert.equal(result.changed, false);
  const day = (result.plan as ReturnType<typeof cannedPlan>).days[0];
  assert.equal(day.tasks[0].text, PHASE);
});
