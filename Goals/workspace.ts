import mongoose from "mongoose";

import {
  GoalCheckin,
  GoalEvidence,
  GoalJob,
  GoalReview,
} from "./Modals/goal.modal.js";
import { clarifyStoredPlan, repairThinStoredPlan } from "./stepClarity.js";

type Dict = Record<string, unknown>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const asRecord = (value: unknown): Dict =>
  value && typeof value === "object" ? (value as Dict) : {};

const asArray = (value: unknown): Dict[] =>
  Array.isArray(value) ? value.filter((item): item is Dict => Boolean(item) && typeof item === "object") : [];

const text = (value: unknown, max = 400) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const readSourceCopy = async (sourceType: string, sourceId: string) => {
  const database = mongoose.connection.db;
  if (!database || !mongoose.Types.ObjectId.isValid(sourceId)) return null;
  const id = new mongoose.Types.ObjectId(sourceId);
  const names = sourceType === "note" ? ["notes", "stagedNotes"] : sourceType === "task" ? ["tasks", "stagedTasks"] : [];
  for (const name of names) {
    const row = await database.collection(name).findOne(
      { _id: id },
      { projection: { title: 1, body: 1, description: 1 } },
    );
    if (row) return row as { title?: unknown; body?: unknown; description?: unknown };
  }
  return null;
};

const evidenceLabel = async (item: { text?: string; sourceType?: string; sourceId?: string }) => {
  const stored = text(item.text, 4000);
  const sourceType = String(item.sourceType || "");
  const row = await readSourceCopy(sourceType, String(item.sourceId || ""));
  const body = String(row?.body ?? row?.description ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) return stored;
  const title = text(row?.title, 180) || (sourceType === "note" ? "Untitled note" : "Untitled task");
  const prefix = sourceType === "note" ? `Space note “${title}”.` : `Space task “${title}”.`;
  const full = `${prefix}\n${body}`.slice(0, 4000);
  return full.length > stored.length ? full : stored;
};

const dayKey = (date = new Date(), timeZone = "Asia/Kolkata") =>
  date.toLocaleDateString("en-CA", { timeZone: timeZone || "Asia/Kolkata" });

const parseKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatKey = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (key: string, days: number) => {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return formatKey(date);
};

export const diffDays = (from: string, to: string) =>
  Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);

const labelDate = (key: string) => {
  const date = parseKey(key);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

const labelRange = (start: string, end: string) => {
  const a = parseKey(start);
  const b = parseKey(end);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${b.getUTCDate()}`;
  return `${labelDate(start)} – ${labelDate(end)}`;
};

const mondayOf = (key: string) => {
  const day = parseKey(key).getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(key, delta);
};

const echoesHeading = (heading: string, value: string) => {
  const norm = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const left = norm(heading);
  const right = norm(value);
  if (!left || !right) return false;
  if (right === left) return true;
  if (right.startsWith(left) && right.length <= left.length + 42) return true;
  return left.length > 8 && right.includes(left) && right.length <= left.length + 42;
};

const cleanStepTitle = (value: string) => value.replace(/^(?:day|d)\s*\d+\s*[-–—:]\s*/i, "").trim() || value.trim();

const explainStep = (title: string, tasks: string[], done: string) => {
  const useful = tasks.map((item) => item.trim().replace(/\.$/, "")).filter((item) => item && item.toLowerCase() !== title.toLowerCase());
  const lead = useful.length >= 2 ? `${useful[0]}. Then ${useful[1][0].toLowerCase()}${useful[1].slice(1)}.` : useful[0] ? `${useful[0]}.` : title;
  const finish = done.trim().replace(/\.$/, "");
  if (finish && finish.toLowerCase() !== title.toLowerCase() && !lead.toLowerCase().includes(finish.toLowerCase())) {
    return `${lead} Done when ${finish[0].toLowerCase()}${finish.slice(1)}.`;
  }
  return lead;
};

const explanationFor = (heading: string, current: string, detail: string) => current.trim() || detail.trim() || heading.trim();

const parseHorizon = (timeframe: string, maxDay: number) => {
  const source = timeframe.toLowerCase().replace(/(\d+)\s*-\s*(day|week|month|year)/g, "$1 $2");
  if (/\b(a year|1 year|12 months|within a year)\b/.test(source)) return Math.max(365, maxDay);
  const years = source.match(/(\d+)\s*year/);
  if (years) return Math.max((Number(years[1]) || 1) * 365, maxDay, 365);
  const months = source.match(/(\d+)\s*month/);
  if (months) return Math.max((Number(months[1]) || 0) * 30, maxDay, 30);
  if (/\b6 months\b/.test(source)) return Math.max(180, maxDay);
  const weeks = source.match(/(\d+)\s*week/);
  if (weeks) return Math.max((Number(weeks[1]) || 0) * 7, maxDay, 7);
  const days = source.match(/(\d+)\s*day/);
  if (days) return Math.max(Number(days[1]) || 0, maxDay, 1);
  if (/no fixed/.test(source)) return Math.max(90, maxDay);
  return Math.max(maxDay, 30);
};

const inferMetric = (goal: Dict, plan: Dict) => {
  const metrics = asArray(asRecord(plan.successDefinition).metrics);
  const blob = [
    goal.title,
    goal.statement,
    goal.targetMetric,
    goal.successCriteria,
    ...metrics.flatMap((item) => [item.label, item.target]),
  ]
    .map((item) => text(item, 400))
    .join(" ");
  const match = blob.match(/(\d[\d,]*)\s*(users|customers|sign[- ]?ups|subscribers|sales|leads|reps|sessions|kg|pounds|%)/i);
  const numeric = typeof goal.targetValue === "number" && Number.isFinite(goal.targetValue) ? goal.targetValue : null;
  const planTarget = typeof plan.targetValue === "number" && Number.isFinite(plan.targetValue) ? plan.targetValue : null;
  const parsed = match ? Number(String(match[1]).replace(/,/g, "")) : null;
  const target = numeric ?? planTarget ?? (parsed && Number.isFinite(parsed) ? parsed : null);
  const label = match?.[2]
    ? match[2].replace(/sign[- ]?ups/i, "Sign-ups").replace(/^./, (char) => char.toUpperCase())
    : text(metrics[0]?.label, 40) || "Progress";
  return {
    label: label === "Success criteria" ? "Progress" : label,
    target,
  };
};

const categoryFor = (_title: string, focus: string) => text(focus, 28) || "Step";

const sourceLabel = (sourceType: string) => {
  const key = sourceType.toLowerCase();
  if (key.includes("transcript") || key.includes("meeting")) return "Meeting";
  if (key.includes("note")) return "Note";
  if (key.includes("task")) return "Task";
  if (key.includes("checkin")) return "Check-in";
  return "Evidence";
};

export type WorkspaceActionInput = {
  action: string;
  stepId?: string;
  date?: string;
  note?: string;
  mode?: string;
  recommendationId?: string;
  adjustmentIds?: string[];
  reflection?: string;
};

const stepIdOf = (day: Dict) => text(day.id, 80) || `day-${Number(day.dayIndex) || 0}`;

export const mutatePlan = (plan: Dict, input: WorkspaceActionInput, today: string) => {
  const days = asArray(plan.days);
  const findIndex = (stepId: string) =>
    days.findIndex((day) => stepIdOf(day) === stepId || `day-${Number(day.dayIndex) || 0}` === stepId);

  const touchDay = (day: Dict) => {
    if (!day.id) day.id = stepIdOf(day);
  };
  days.forEach(touchDay);

  if (input.action === "complete" || input.action === "reopen" || input.action === "note" || input.action === "reschedule") {
    const index = findIndex(text(input.stepId, 80));
    if (index < 0) {
      throw Object.assign(new Error("That step was not found."), { status: 404 });
    }
    const day = days[index];
    if (input.action === "complete") {
      day.status = "done";
      day.completedOn = today;
      for (const task of asArray(day.tasks)) task.done = true;
    } else if (input.action === "reopen") {
      day.status = "reopened";
      day.completedOn = "";
    } else if (input.action === "note") {
      day.notes = text(input.note, 4000);
    } else {
      const mode = text(input.mode, 20) || (text(input.date, 20) === "skip" ? "skip" : "move");
      if (mode === "skip" || input.date === "skip") {
        day.status = "skipped";
        day.skippedOn = today;
      } else if (mode === "split") {
        splitDay(days, index, today, text(input.date, 20));
      } else {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(text(input.date, 20)) ? text(input.date, 20) : addDays(today, 1);
        day.scheduledDate = date;
        if (day.status === "skipped") day.status = "open";
      }
    }
  } else if (input.action === "apply_recommendation") {
    applyRecommendation(plan, days, text(input.recommendationId, 80), today);
  } else if (input.action === "apply_checkin") {
    applyAdjustments(plan, days, Array.isArray(input.adjustmentIds) ? input.adjustmentIds : [], today);
    plan.weeklyReflection = text(input.reflection, 2000);
  } else {
    throw Object.assign(new Error("Choose a valid workspace action."), { status: 400 });
  }

  plan.days = days;
  return plan;
};

const splitDay = (days: Dict[], index: number, today: string, requestedDate: string) => {
  const day = days[index];
  const tasks = asArray(day.tasks);
  const title = text(day.title, 160) || "This step";
  const parts = title.split(",").map((part) => part.trim()).filter(Boolean);
  let firstTitle = title;
  let secondTitle = `Finish ${title}`;
  let firstTasks = tasks;
  let secondTasks: Dict[] = [];
  if (tasks.length >= 2) {
    const mid = Math.ceil(tasks.length / 2);
    firstTasks = tasks.slice(0, mid);
    secondTasks = tasks.slice(mid);
    firstTitle = text(firstTasks[0]?.text, 160) || title;
    secondTitle = text(secondTasks[0]?.text, 160) || secondTitle;
  } else if (parts.length >= 2) {
    firstTitle = /^draft\b/i.test(parts[0]) ? parts[0] : `Draft ${parts[0].replace(/^(write|create|finish|publish|send)\s+/i, "")}`;
    const rest = parts.slice(1).join(", ");
    secondTitle = /^(write|finish|publish|send)\b/i.test(rest) ? rest : `Write ${rest}`;
    firstTasks = [{ id: `${stepIdOf(day)}-a`, text: firstTitle, done: false, why: text(day.focus, 240), definitionOfDone: "Draft is ready to review." }];
    secondTasks = [{ id: `${stepIdOf(day)}-b`, text: secondTitle, done: false, why: text(day.focus, 240), definitionOfDone: "The second piece is ready to publish." }];
  } else {
    firstTitle = `Draft ${title}`;
    secondTitle = `Finish ${title}`;
    firstTasks = [{ id: `${stepIdOf(day)}-a`, text: firstTitle, done: false, why: text(day.focus, 240), definitionOfDone: "A first draft exists." }];
    secondTasks = [{ id: `${stepIdOf(day)}-b`, text: secondTitle, done: false, why: text(day.focus, 240), definitionOfDone: "The step is finished." }];
  }
  day.title = firstTitle;
  day.tasks = firstTasks;
  day.scheduledDate = today;
  day.status = day.status === "done" ? "done" : "open";
  const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : addDays(today, 2);
  days.splice(index + 1, 0, {
    id: `${stepIdOf(day)}-split`,
    dayIndex: Number(day.dayIndex || index + 1) + 1,
    scheduledDate: nextDate,
    title: secondTitle,
    focus: text(day.focus, 320),
    tasks: secondTasks,
    definitionOfDone: text(day.definitionOfDone, 320),
    status: "open",
    category: text(day.category, 40),
    minutes: Number(day.minutes) || 45,
  });
};

const applyRecommendation = (plan: Dict, days: Dict[], recommendationId: string, today: string) => {
  const recommendations = asArray(plan.priorityRecommendations);
  const match = recommendations.find((item, index) => text(item.id, 80) === recommendationId || `plan-rec-${index}` === recommendationId);
  if (!match) {
    throw Object.assign(new Error("That recommendation was not found."), { status: 404 });
  }
  const steps = Array.isArray(match.howSteps) ? match.howSteps.map((item) => text(item, 180)).filter(Boolean) : [];
  const titles = steps.length ? steps : [text(match.title, 160)];
  titles.forEach((title, index) => {
    days.push({
      id: `added-${recommendationId}-${index + 1}`,
      dayIndex: days.length + index + 1,
      scheduledDate: addDays(today, index + 1),
      title,
      focus: text(match.reason, 320),
      tasks: [
        {
          id: `added-${recommendationId}-t-${index + 1}`,
          text: title,
          done: false,
          why: text(match.reason, 320),
          definitionOfDone: text(match.measurableGoal, 240) || `“${title}” is done and checked.`,
        },
      ],
      definitionOfDone: text(match.measurableGoal, 240),
      status: "open",
      category: "Plan",
      minutes: Number(match.suggestedDurationMinutes) || 45,
      sourceRecommendationId: recommendationId,
    });
  });
  const applied = Array.isArray(plan.appliedRecommendationIds) ? plan.appliedRecommendationIds.map((item) => String(item)) : [];
  if (!applied.includes(recommendationId)) applied.push(recommendationId);
  plan.appliedRecommendationIds = applied;
};

const applyAdjustments = (plan: Dict, days: Dict[], adjustmentIds: string[], today: string) => {
  for (const raw of adjustmentIds) {
    const [kind, stepId, date] = String(raw || "").split("|");
    if (kind === "move" && stepId) {
      const day = days.find((item) => stepIdOf(item) === stepId);
      if (day) {
        day.scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : addDays(today, 1);
        if (day.status === "skipped") day.status = "open";
      }
    } else if (kind === "habit") {
      days.push({
        id: `habit-${today}`,
        dayIndex: days.length + 1,
        scheduledDate: today,
        title: "20-minute focus block",
        focus: "One short block on the next real step.",
        tasks: [
          {
            id: `habit-${today}-t`,
            text: "Work the next open step for 20 minutes and write what finished",
            done: false,
            why: "A small finished block is easier to continue than extra busywork.",
            definitionOfDone: "The block is done and what finished is written down.",
          },
        ],
        status: "open",
        category: "Focus",
        minutes: 20,
      });
    } else if (kind === "pin" && stepId) {
      applyRecommendation(plan, days, stepId, today);
    }
  }
};

const isDoneDay = (day: Dict) => {
  if (text(day.status, 20).toLowerCase() === "reopened") return false;
  // Only a person marking the step done sets completedOn. A model "done" flag is not progress.
  return Boolean(text(day.completedOn, 40));
};

const stepsFromMilestones = (plan: Dict): Dict[] =>
  asArray(plan.milestones).map((milestone, index) => {
    const title = text(milestone.title, 160) || `Step ${index + 1}`;
    const criteria = Array.isArray(milestone.successCriteria)
      ? milestone.successCriteria.map((item) => text(item, 240)).filter(Boolean)
      : [];
    return {
      id: `milestone-step-${index + 1}`,
      dayIndex: index + 1,
      title,
      focus: criteria[0] || title,
      definitionOfDone: criteria[0] || title,
      status: "open",
      minutes: 45,
      tasks: (criteria.length ? criteria : [title]).map((item, taskIndex) => ({
        id: `milestone-step-${index + 1}-t${taskIndex + 1}`,
        text: item,
        done: false,
        why: `${title}: ${item}`,
        definitionOfDone: item,
      })),
    };
  });

const isPlan = (value: unknown): value is Dict => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const persistClearSteps = async (goal: {
  approvedPlan?: unknown;
  proposedPlan?: unknown;
  markModified: (path: string) => void;
  save: () => Promise<unknown>;
  timeframe?: string;
  statement?: string;
  title?: string;
  description?: string;
  goalType?: string;
  category?: string;
  successCriteria?: string;
  availableHoursPerWeek?: number | null;
  contextProfile?: unknown;
  understanding?: unknown;
  timezone?: string;
  createdAt?: Date | string;
}) => {
  try {
    const approved = isPlan(goal.approvedPlan) ? goal.approvedPlan : null;
    const proposed = isPlan(goal.proposedPlan) ? goal.proposedPlan : null;
    const source = approved || proposed;
    if (!source || !Array.isArray(source.days) || source.days.length === 0) return;
    const zone = goal.timezone || "Asia/Kolkata";
    const planStart = text(source.startedOn, 20);
    const created = goal.createdAt ? dayKey(new Date(goal.createdAt), zone) : "";
    const start = /^\d{4}-\d{2}-\d{2}$/.test(planStart) ? planStart : created;
    const repaired = repairThinStoredPlan(source, goal as Dict, start);
    const clarified = clarifyStoredPlan(repaired.plan);
    if (!repaired.changed && !clarified.changed) return;
    const proposedMatches =
      Boolean(approved && proposed) && JSON.stringify(approved?.days || []) === JSON.stringify(proposed?.days || []);
    if (approved) {
      goal.approvedPlan = clarified.plan;
      goal.markModified("approvedPlan");
    }
    if ((proposed && !approved) || proposedMatches) {
      goal.proposedPlan = proposedMatches ? JSON.parse(JSON.stringify(clarified.plan)) : clarified.plan;
      goal.markModified("proposedPlan");
    }
    await goal.save();
  } catch (error) {
    console.error("Unable to store clearer goal steps", error);
  }
};

export const buildGoalWorkspace = async (goal: {
  _id: mongoose.Types.ObjectId;
  title?: string;
  statement?: string;
  status?: string;
  timeframe?: string;
  timezone?: string;
  createdAt?: Date | string;
  currentValue?: number | null;
  targetValue?: number | null;
  targetMetric?: string;
  successCriteria?: string;
  healthStatus?: string;
  approvedPlan?: unknown;
  proposedPlan?: unknown;
}) => {
  const plan = asRecord(goal.approvedPlan || goal.proposedPlan);
  const zone = goal.timezone || "Asia/Kolkata";
  const today = dayKey(new Date(), zone);
  const startedOn = text(plan.startedOn, 20) || dayKey(goal.createdAt ? new Date(goal.createdAt) : new Date(), zone);
  const storedDays = asArray(plan.days);
  const rawDays = storedDays.length ? storedDays : stepsFromMilestones(plan);
  const maxIndex = rawDays.reduce((max, day) => Math.max(max, Number(day.dayIndex) || 0), 0);
  const deadlineLabel = text(asRecord(plan.successDefinition).deadlineLabel, 80);
  const explicitDeadline = `${goal.timeframe || ""} ${deadlineLabel}`.trim();
  let horizon = parseHorizon(explicitDeadline || goal.statement || "", Math.max(maxIndex, rawDays.length, 1));

  const indexed = rawDays.map((day, index) => Number(day.dayIndex) || index + 1);
  const maxPackedIndex = indexed.length ? Math.max(...indexed) : 0;
  const dated = rawDays
    .map((day) => text(day.scheduledDate, 20))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const calendarSpan = dated.length >= 2 ? diffDays(dated[0], dated[dated.length - 1]) + 1 : maxPackedIndex;
  const packed = rawDays.length >= 2 && horizon >= 21 && calendarSpan < horizon * 0.5 && maxPackedIndex <= rawDays.length + 3;
  const slotFor = (index: number) => {
    if (!packed) return 0;
    if (index === rawDays.length - 1) return horizon;
    return 1 + Math.round((index * (horizon - 1)) / Math.max(rawDays.length - 1, 1));
  };

  const steps = rawDays.map((day, index) => {
    const displayIndex = index + 1;
    const storedDate = text(day.scheduledDate, 20);
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(storedDate);
    const slot = hasDate ? 0 : slotFor(index);
    const calendarDay = Number(day.scheduleDay) || Number(day.dayIndex) || displayIndex;
    const scheduled = hasDate ? storedDate : addDays(startedOn, Math.max((slot || calendarDay) - 1, 0));
    const dayTitle = cleanStepTitle(text(day.title, 160) || `Step ${displayIndex}`);
    const tasks = asArray(day.tasks).map((task, taskIndex) => {
      const action = text(task.text, 240);
      const storedDone = text(task.definitionOfDone, 320);
      const definitionOfDone = storedDone;
      return {
        id: text(task.id, 80) || `d${displayIndex}-t-${taskIndex + 1}`,
        text: action,
        done: Boolean(task.done),
        why: text(task.why, 240),
        definitionOfDone,
      };
    });
    const done = isDoneDay(day);
    const skipped = text(day.status, 20).toLowerCase() === "skipped" && Boolean(text(day.skippedOn, 40));
    const status = skipped ? "skipped" : done ? "done" : scheduled < today ? "overdue" : scheduled === today ? "today" : "open";
    const minutes = Number(day.minutes) || (typeof day.hours === "number" ? Math.round(Number(day.hours) * 60) : 45);
    const storedFocus = text(day.focus, 600).replace(/\s*Do this by day \d+ of \d+\.?/gi, "").trim();
    const why = storedFocus || explainStep(dayTitle, tasks.map((task) => task.text), text(day.definitionOfDone, 320));
    const storedCategory = text(day.category, 40);
    const category = storedCategory && !echoesHeading(dayTitle, storedCategory) ? storedCategory : categoryFor(dayTitle, why);
    const storedOutcome = text(day.definitionOfDone, 320);
    const outcome = storedOutcome && !echoesHeading(dayTitle, storedOutcome) ? storedOutcome : "";
    return {
      id: stepIdOf(day),
      dayIndex: displayIndex,
      date: scheduled,
      dateLabel: labelDate(scheduled),
      title: dayTitle,
      category,
      minutes,
      example: Boolean(day.example),
      status,
      checklist: tasks,
      checklistDone: tasks.filter((task) => task.done).length,
      checklistTotal: tasks.length,
      why,
      outcome,
      doneWhen: outcome,
      notes: text(day.notes, 4000),
      partOf: text(day.partOf, 80) && !echoesHeading(dayTitle, text(day.partOf, 80)) ? text(day.partOf, 80) : category,
      overdueDays: scheduled < today && !done && !skipped ? diffDays(scheduled, today) : 0,
    };
  });

  const lastDate = steps.reduce((max, step) => (step.date > max ? step.date : max), startedOn);
  if (diffDays(startedOn, lastDate) + 1 > horizon) horizon = diffDays(startedOn, lastDate) + 1;
  const endsOn = addDays(startedOn, Math.max(horizon - 1, 0));
  const dayNumber = Math.min(horizon, Math.max(1, diffDays(startedOn, today) + 1));
  const activeSteps = steps.filter((step) => step.status !== "skipped");
  const stepsDone = activeSteps.filter((step) => step.status === "done").length;
  const stepsTotal = activeSteps.length;
  const attention = steps.filter((step) => step.status === "overdue");
  const todayStep =
    steps.find((step) => step.date === today && step.status !== "done" && step.status !== "skipped") ||
    steps.find((step) => step.status === "today") ||
    steps.find((step) => step.status === "open") ||
    steps.find((step) => step.status === "overdue") ||
    null;

  const weekStart = mondayOf(startedOn);
  const weekMap = new Map<string, typeof steps>();
  for (const step of steps) {
    const key = mondayOf(step.date);
    const list = weekMap.get(key) || [];
    list.push(step);
    weekMap.set(key, list);
  }
  const weekKeys = [...weekMap.keys()].sort();
  const weeks = weekKeys.map((key) => {
    const list = weekMap.get(key) || [];
    const end = addDays(key, 6);
    const done = list.filter((step) => step.status === "done").length;
    const overdue = list.filter((step) => step.status === "overdue").length;
    const containsToday = today >= key && today <= end;
    const flag = overdue ? `${overdue} overdue` : containsToday ? "This week" : done === list.length && list.length ? "Complete" : "";
    const offset = Math.max(1, Math.round(diffDays(weekStart, key) / 7) + 1);
    return {
      id: key,
      label: `Week ${offset}`,
      rangeLabel: labelRange(key, end),
      flag,
      done,
      total: list.length,
      expanded: containsToday,
      steps: list.sort((left, right) => left.date.localeCompare(right.date) || left.dayIndex - right.dayIndex),
    };
  });

  const metricInfo = inferMetric(goal as Dict, plan);
  const current = typeof goal.currentValue === "number" && Number.isFinite(goal.currentValue) ? goal.currentValue : null;
  const target = metricInfo.target;
  const todayTarget = target == null ? null : Math.max(1, Math.round((target * dayNumber) / horizon));
  const [checkins, evidence, review, runningJob] = await Promise.all([
    GoalCheckin.find({ goalId: goal._id }).sort({ createdAt: 1 }).lean(),
    GoalEvidence.find({ goalId: goal._id }).sort({ createdAt: -1 }).limit(6).lean(),
    GoalReview.findOne({ goalId: goal._id }).sort({ createdAt: -1 }).lean(),
    GoalJob.exists({ goalId: goal._id, status: { $in: ["queued", "running"] } }),
  ]);
  const lastCheckin = checkins[checkins.length - 1];
  const checkinDays = new Set(
    checkins.map((item) => dayKey(item.createdAt ? new Date(item.createdAt) : new Date(), zone)),
  );
  for (const step of steps) {
    if (step.status === "done") checkinDays.add(step.date);
  }
  let streak = 0;
  let cursor = checkinDays.has(today) ? today : addDays(today, -1);
  while (checkinDays.has(cursor) && streak < horizon + 2) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const chart = Array.from({ length: Math.min(horizon, 30) }, (_, index) => {
    const day = index + 1;
    const date = addDays(startedOn, index);
    const logged = [...checkins].reverse().find((item) => dayKey(new Date(item.createdAt || today), zone) <= date);
    const real = date > today ? null : logged ? Number(logged.value) : current != null && date <= today ? current : null;
    return {
      day,
      label: `Day ${day}`,
      date,
      real: date > today ? null : real,
      target: target == null ? null : Math.round((target * day) / horizon),
    };
  });

  const paceRatio = todayTarget && current != null ? current / todayTarget : stepsTotal ? stepsDone / Math.max(1, activeSteps.filter((step) => step.date <= today).length) : null;
  const allDone = stepsTotal > 0 && stepsDone >= stepsTotal;
  const metricHit = target != null && current != null && current >= target;
  const achieved = goal.status === "COMPLETED" || allDone || metricHit;
  const behind = !achieved && ((paceRatio != null && paceRatio < 0.75) || attention.length >= 2 || goal.healthStatus === "AT_RISK" || goal.healthStatus === "BLOCKED");
  const pace = achieved ? "achieved" : behind ? "at_risk" : "on_track";
  const finishedEarlyDays = achieved && today < endsOn ? diffDays(today, endsOn) : null;

  const usableCoach = (value: string) => Boolean(value);
  const coachText =
    (todayStep && todayStep.why.split(/\s+/).length >= 12 && usableCoach(todayStep.why) ? todayStep.why : "") ||
    (usableCoach(text(review?.focus, 320)) ? text(review?.focus, 320) : "") ||
    (usableCoach(text(plan.coachNote, 320)) ? text(plan.coachNote, 320) : "") ||
    (usableCoach(text(plan.immediateNextStep, 320)) ? text(plan.immediateNextStep, 320) : "") ||
    (todayStep ? `Start with “${todayStep.title}”.` : "Your next step will show here once the plan is ready.");
  const coachEvidence = await Promise.all(
    evidence.slice(0, 3).map(async (item) => ({
      id: String(item._id || ""),
      label: (await evidenceLabel(item)) || sourceLabel(String(item.sourceType || "")),
      kind: sourceLabel(String(item.sourceType || "")),
      dateLabel: item.createdAt ? labelDate(dayKey(new Date(item.createdAt), zone)) : "",
      example: Boolean(plan.provisional),
    })),
  );

  const strategies = asArray(plan.strategies).map((strategy, index) => {
    const id = text(strategy.id, 80) || `strategy-${index + 1}`;
    const linked = steps.filter((step) => step.partOf.toLowerCase() === text(strategy.title, 80).toLowerCase() || step.category.toLowerCase() === text(strategy.title, 40).toLowerCase());
    const pool = linked.length ? linked : steps.slice(index * 2, index * 2 + 3);
    const done = pool.filter((step) => step.status === "done").length;
    return {
      id,
      title: text(strategy.title, 160),
      body: text(strategy.body, 600),
      overview: explanationFor(text(strategy.title, 160), text(strategy.why, 400), text(strategy.body, 600)),
      done,
      total: pool.length,
      percent: pool.length ? Math.round((done / pool.length) * 100) : 0,
      active: index === 0 || done < pool.length,
      windowLabel: text(strategy.effort, 40) || `${horizon} days`,
      linkedSteps: pool.map((step) => ({
        id: step.id,
        title: step.title,
        dayLabel: `Day ${step.dayIndex}`,
        done: step.status === "done",
      })),
    };
  });

  const applied = new Set(
    (Array.isArray(plan.appliedRecommendationIds) ? plan.appliedRecommendationIds : []).map((item) => String(item)),
  );
  const recommendations = asArray(plan.priorityRecommendations).map((item, index) => {
    const id = text(item.id, 80) || `plan-rec-${index}`;
    const howSteps = (Array.isArray(item.howSteps) ? item.howSteps : []).map((step) => text(step, 180)).filter(Boolean);
    return {
      id,
      title: text(item.title, 180),
      reason: text(item.reason, 600),
      windowLabel: text(item.measurableGoal, 40) || `${horizon} days`,
      howSteps,
      category: text(item.milestoneTitle, 40) || "Next step",
      added: applied.has(id),
      related: steps.slice(0, 4).map((step) => ({ id: step.id, label: step.title, done: step.status === "done" })),
    };
  });

  const currentWeek = weeks.find((week) => week.expanded) || weeks[weeks.length - 1] || null;
  const weekSteps = currentWeek?.steps || [];
  const weekDone = weekSteps.filter((step) => step.status === "done");
  const notesAdded = weekSteps.reduce((sum, step) => sum + (step.notes ? 1 : 0) + step.checklist.filter((item) => item.definitionOfDone).length * 0, weekSteps.filter((step) => step.notes).length);
  const noteCount = weekSteps.filter((step) => step.notes).length + checkins.filter((item) => item.note).length;
  const usersTarget = todayTarget;
  const pacePercent = todayTarget && current != null ? Math.round((current / todayTarget) * 100) : paceRatio != null ? Math.round(paceRatio * 100) : null;
  const nextOpenDate = addDays(today, 1);
  const goalName = text(goal.title, 80) || "this goal";
  const adjustments = [
    ...attention.slice(0, 2).map((step) => ({
      id: `move|${step.id}|${nextOpenDate}`,
      title: `Move “${step.title}” to ${labelDate(nextOpenDate)}`,
      reason: `It slipped. ${labelDate(nextOpenDate)} is the next open day.`,
      selected: true,
      kind: "move",
    })),
    ...(behind
      ? [
          {
            id: "habit|focus|20",
            title: `Spend 20 minutes on the next step for “${goalName}”`,
            reason: "A short block on the real next step, not extra busywork.",
            selected: true,
            kind: "habit",
          },
        ]
      : []),
    ...recommendations.slice(0, 1).filter((item) => !item.added).map((item) => ({
      id: `pin|${item.id}|`,
      title: `Pin “${item.title}” into the plan`,
      reason: item.reason || "It covers the steps that are behind.",
      selected: false,
      kind: "pin",
    })),
  ];

  const nextRecommendation = recommendations.find((item) => !item.added);
  const recoveryActions = [
    ...attention.slice(0, 2).map((step, index) => ({
      id: `move|${step.id}|${addDays(today, index + 1)}`,
      title: `Move “${step.title}” to ${labelDate(addDays(today, index + 1))}`,
      detail: "Keep the rest of the plan in the same order.",
      example: Boolean(plan.provisional),
    })),
    nextRecommendation
      ? {
          id: `pin|${nextRecommendation.id}|`,
          title: `Do “${nextRecommendation.title}” next`,
          detail: nextRecommendation.reason || "This is the next concrete action in the plan.",
          example: Boolean(plan.provisional),
        }
      : {
          id: "habit|focus|20",
          title: `Spend 20 minutes on the next step for “${goalName}”`,
          detail: "Finish one real step before adding new work.",
          example: Boolean(plan.provisional),
        },
  ];

  return {
    revision: 5,
    title: text(goal.title, 160) || "Goal",
    status: goal.status || "",
    startedOn,
    startedLabel: labelDate(startedOn).toUpperCase(),
    endsOn,
    endsLabel: labelDate(endsOn),
    dayNumber,
    horizonDays: horizon,
    stepsDone,
    stepsTotal,
    daysLeft: Math.max(0, diffDays(today, endsOn)),
    progressPercent: stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0,
    pace,
    paceLabel: achieved ? "Goal achieved" : behind ? "Behind pace" : "On track to finish",
    achieved,
    finishedEarlyDays,
    today,
    metric: {
      label: metricInfo.label,
      current,
      target,
      todayTarget,
      lastLogged: lastCheckin ? Number(lastCheckin.value) : current,
      lastLoggedOn: lastCheckin?.createdAt ? dayKey(new Date(lastCheckin.createdAt), zone) : null,
      lastLoggedLabel: lastCheckin?.createdAt ? labelDate(dayKey(new Date(lastCheckin.createdAt), zone)) : "",
      streak,
    },
    chart,
    coach: {
      status: runningJob ? "thinking" : "ready",
      text: coachText,
      evidence: coachEvidence,
    },
    todayStep,
    attention,
    weeks,
    strategies,
    recommendations,
    checkIn: currentWeek
      ? {
          weekLabel: `${currentWeek.label} · ${currentWeek.rangeLabel}`,
          headline: `${weekDone.length} of ${weekSteps.length} steps done. ${behind ? `${metricInfo.label} are behind pace.` : "Pace is holding."}`,
          stepsDone: weekDone.length,
          stepsTotal: weekSteps.length,
          usersCurrent: current,
          usersTarget,
          pacePercent,
          notesAdded: noteCount || notesAdded,
          completed: weekSteps.map((step) => ({
            id: step.id,
            title: step.title,
            doneOn: step.status === "done" ? step.dateLabel : "",
            overdue: step.status === "overdue",
            done: step.status === "done",
          })),
          adjustments,
          reflection: text(plan.weeklyReflection, 2000),
        }
      : null,
    recovery: behind
      ? {
          riskLabel: `At risk · ${current ?? 0} of ${todayTarget ?? target ?? 0} target ${metricInfo.label.toLowerCase()} by Day ${dayNumber}`,
          title: "Get back on track in 5 days",
          summary: `${attention.length || "Some"} step${attention.length === 1 ? " is" : "s are"} overdue. The coach suggests this recovery plan.`,
          actions: recoveryActions,
          projection: target != null ? `Projected: ${target} ${metricInfo.label.toLowerCase()} by ${labelDate(endsOn)} if followed` : `Projected back on pace by ${labelDate(addDays(today, 5))} if followed`,
        }
      : null,
  };
};
