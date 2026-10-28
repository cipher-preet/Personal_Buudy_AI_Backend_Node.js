/**
 * Turn outcome labels into checklist actions.
 * Mirrors services/goals/step_actions.py so a stored plan that only says
 * "Do the work for …" becomes the draft, the ask, and the saved result.
 */

type Dict = Record<string, unknown>;

const GENERIC =
  /do the work for|save something you can open|do the smallest version|do the first small piece|you can open the result|this phase['’]s outcome|can be shown|outcome is completed/i;
const TEMPLATE =
  /language fundamentals|platform preference|this phase['’]s outcome|can be shown|outcome is completed/i;
const VERB =
  /^(write|interview|ask|list|message|email|call|publish|post|export|define|count|set|create|draft|record|build|test|measure|invite|contact|open|pick|choose|schedule|practice|review|send|share|track|name|map|find|collect|run|fix|ship|launch|prepare|make|show|talk|meet|book|save|check|confirm|outline|design|add|remove|update|compare|calculate|decide|sign|apply|study|read|train|walk|smoke|verify|improve|expand|finalize|freeze|deploy|watch|capture|turn|do|finish|complete|start|document|assemble|hold|give|break|note|mark|package|walk)\b/i;
const OUTCOME_END =
  /\b(signed\s+by\s+.+|approved|held|distributed|updated|delivered|obtained|reviewed|completed|re-?baselined(?:\s+if\s+needed)?|documented|finished|created|prepared|saved)\s*$/i;

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalize = (value: unknown) =>
  clean(value).replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");

const echoes = (heading: string, value: string) => {
  const norm = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const left = norm(heading);
  const right = norm(value);
  if (!left || !right) return false;
  if (right === left) return true;
  if (right.startsWith(left) && right.length <= left.length + 42) return true;
  return left.length > 0 && right.includes(left) && right.length <= left.length + 42;
};

export const unwrapGeneric = (value: string) => {
  const match = normalize(value).match(/do the work for\s*["“'](.+?)["”']/i);
  return match ? match[1].trim() : normalize(value);
};

export const isClearAction = (value: string, title = "") => {
  const text = unwrapGeneric(value);
  if (!text || GENERIC.test(text)) return false;
  if (title && echoes(title, text)) return false;
  const words = text.split(" ");
  if (VERB.test(text) && words.length >= 3) return true;
  return words.length >= 6 && !OUTCOME_END.test(text);
};

const soft = (noun: string) => {
  const text = normalize(noun).replace(/^[.\s]+|[.\s]+$/g, "");
  if (!text) return "this";
  if (/^(a|an|the)\b/i.test(text)) return text[0].toLowerCase() + text.slice(1);
  if (text === text.toUpperCase() || /^[A-Z0-9-]{2,}$/.test(text)) return `the ${text}`;
  return `the ${text[0].toLowerCase()}${text.slice(1)}`;
};

const cap = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

const item = (text: string, why: string, definitionOfDone: string) => ({
  text: normalize(text).slice(0, 240),
  why: normalize(why).slice(0, 240),
  definitionOfDone: normalize(definitionOfDone).slice(0, 240),
});

const suffixOf = (part: string) => {
  const match = part.match(OUTCOME_END);
  if (!match || match.index === undefined) return { head: part.trim(), suffix: "" };
  return { head: part.slice(0, match.index).trim().replace(/[,\s]+$/g, ""), suffix: match[1].trim() };
};

export const splitClauses = (value: string) => {
  const cleaned = unwrapGeneric(value).replace(/^[.\s]+|[.\s]+$/g, "");
  if (!cleaned) return [];
  const chunks = cleaned.split(",").map((chunk) => chunk.trim().replace(/^[.\s]+|[.\s]+$/g, "")).filter(Boolean);
  const parts: string[] = [];
  for (const chunk of chunks.length ? chunks : [cleaned]) {
    if (/\bsigned\s+by\b/i.test(chunk)) {
      parts.push(chunk);
      continue;
    }
    const bits = chunk.split(/\s+\band\b\s+/i).map((bit) => bit.trim().replace(/^[.\s]+|[.\s]+$/g, "")).filter(Boolean);
    parts.push(...(bits.length ? bits : [chunk]));
  }
  if (parts.length <= 1) return parts.length ? parts : [cleaned];
  if (parts.slice(0, -1).some((part) => suffixOf(part).suffix)) return parts;
  const last = suffixOf(parts[parts.length - 1]);
  if (!last.suffix || !last.head) return parts;
  return [...parts.slice(0, -1).map((part) => `${part} ${last.suffix}`.trim()), `${last.head} ${last.suffix}`.trim()];
};

const signedSteps = (doc: string, who: string) => {
  const noun = soft(doc);
  const people = who.trim().replace(/[.\s]+$/g, "") || "the people who must accept it";
  return [
    item(
      `Write ${noun}: what is included, what is out, the deliverables, and the assumptions.`,
      `A signature only helps if ${noun} says what you will and will not do.`,
      `A draft of ${noun} is saved.`,
    ),
    item(
      `Send ${noun} to ${people}, and ask each person to sign or mark what they will not accept.`,
      "These are the people who can stop the work later if they never agreed.",
      `Each required person has replied on ${noun}.`,
    ),
    item(
      `Save the signed copy of ${noun}. Do not start the next step until that copy is stored.`,
      "Later questions about scope get answered from the signed copy.",
      `The signed ${doc.trim()} is stored where the team can find it.`,
    ),
  ];
};

const approvedSequence = (what: string) => {
  const noun = soft(what);
  return [
    item(
      `Draft ${noun} so a reviewer can see the choices, not just the heading.`,
      `Approval is meaningless if ${noun} is only a title.`,
      `A reviewable draft of ${noun} is saved.`,
    ),
    item(
      `Ask for approval of ${noun} and write what was accepted and what must change.`,
      "The next step should follow the accepted version.",
      `The review notes for ${noun} are saved.`,
    ),
    item(
      `Save the approved version of ${noun} and use that version from here on.`,
      "A later draft should not quietly replace the approved one.",
      `The approved ${what.trim()} is the copy everyone uses.`,
    ),
  ];
};

const heldSequence = (what: string) => {
  const noun = soft(what);
  return [
    item(
      `Write the agenda for ${noun}, including the decisions you need, and send it the day before.`,
      "People cannot decide in the room if they see the questions for the first time.",
      `The agenda for ${noun} has been sent.`,
    ),
    item(
      `Hold ${noun} and write every decision, owner, and open question before people leave.`,
      "A meeting that ends without notes leaves the same questions open.",
      `The notes from ${noun} list each decision and its owner.`,
    ),
    item(
      `Send the notes from ${noun} to anyone who owns a decision but was not there.`,
      "An owner who never sees the note will not do the work.",
      `The notes from ${noun} were sent to the owners.`,
    ),
  ];
};

const actionForClause = (clause: string) => {
  const text = normalize(clause).replace(/^[.\s]+|[.\s]+$/g, "");
  const signed = text.match(/^(?<doc>.+?)\s+signed\s+by\s+(?<who>.+)$/i);
  if (signed?.groups) {
    const noun = soft(signed.groups.doc);
    const who = signed.groups.who.trim();
    return item(
      `Write ${noun} and get it signed by ${who}.`,
      `Do not treat the work as agreed until ${who} has signed ${noun}.`,
      `The signed ${signed.groups.doc.trim()} is stored.`,
    );
  }
  const rebased = text.match(/^(?<what>.+?)\s+re-?baselined(?:\s+if\s+needed)?$/i);
  if (rebased?.groups) {
    const noun = soft(rebased.groups.what);
    return item(
      `If ${noun} has slipped, rewrite the remaining dates and share them with the people who depend on them.`,
      "A date that moved only helps if the people waiting on it know.",
      `The current dates for ${noun} are written down and shared.`,
    );
  }
  const reviewed = text.match(/^(?<what>.+?)\s+reviewed$/i);
  if (reviewed?.groups) {
    const noun = soft(reviewed.groups.what);
    return item(
      `Compare ${noun} with what was promised and write what is on time, what is late, and why.`,
      "The review is the list of slips, not a meeting that only says things are fine.",
      `A short review of ${noun} says what is on time and what is late.`,
    );
  }
  const held = text.match(/^(?<what>.+?)\s+held$/i);
  if (held?.groups) {
    const noun = soft(held.groups.what);
    return item(
      `Schedule ${noun}, send the agenda the day before, and write every decision and owner before it ends.`,
      `${cap(noun)} only counts if the decisions and owners are written down.`,
      `The notes from ${noun} list each decision and its owner.`,
    );
  }
  const distributed = text.match(/^(?<what>.+?)\s+distributed$/i);
  if (distributed?.groups) {
    const noun = soft(distributed.groups.what);
    return item(
      `Write ${noun} — who gets an update, how often, and where it is posted — and send it to the people who need it.`,
      "People miss the work when they do not know which update is theirs.",
      `${cap(noun)} has been sent to the people who need it.`,
    );
  }
  const obtained = text.match(/^(?<what>.+?)\s+obtained$/i);
  if (obtained?.groups) {
    const noun = soft(obtained.groups.what);
    return item(
      `Ask for ${noun} in writing, and save the reply before you treat this step as done.`,
      "A verbal yes is easy to lose. The reply is the record.",
      `The written reply for ${noun} is saved.`,
    );
  }
  const delivered = text.match(/^(?<what>.+?)\s+delivered$/i);
  if (delivered?.groups) {
    const noun = soft(delivered.groups.what);
    return item(
      `Assemble ${noun} with the deliverables, decisions, and open items, and give it to the people who will use it next.`,
      "Delivery means the next owner has the package, not that you finished a file.",
      `${cap(noun)} was handed to the people who will use it.`,
    );
  }
  const updated = text.match(/^(?<what>.+?)\s+updated$/i);
  if (updated?.groups) {
    const noun = soft(updated.groups.what);
    return item(
      `Update ${noun} with what changed, who owns each item, and the next action.`,
      "An old list sends people after risks that already changed.",
      `${cap(noun)} shows the current owners and next actions.`,
    );
  }
  const approved = text.match(/^(?<what>.+?)\s+approved$/i);
  if (approved?.groups) {
    const noun = soft(approved.groups.what);
    return item(
      `Write ${noun}, then get approval before you start the next step.`,
      "Later work should follow the approved version, not a draft.",
      `The approved copy of ${noun} is saved.`,
    );
  }
  const finished = text.match(/^(?<what>.+?)\s+(?:completed|finished|created|prepared|documented|saved)$/i);
  if (finished?.groups) {
    const noun = soft(finished.groups.what);
    return item(
      `Finish ${noun} and write what is done, what is still open, and who needs it next.`,
      `The next step needs ${noun} in a form someone else can check.`,
      `${cap(noun)} is finished and the open items are listed.`,
    );
  }
  const noun = soft(text);
  return item(
    `Write ${noun} so someone else can see what is done, what is missing, and who needs it next.`,
    `The next step needs ${noun} written down, not just named.`,
    `${cap(noun)} is written down and ready to hand over.`,
  );
};

const plainActions = (subject: string) => {
  const noun = normalize(subject).replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 80) || "this step";
  return [
    item(
      `Write what you will produce for ${noun}, and what finished looks like.`,
      `The next action needs a result for ${noun} that you can point to.`,
      `A short note names the result for ${noun}.`,
    ),
    item(
      `Do the first piece of ${noun} and write what is done and what is still open.`,
      `A step is finished when the result for ${noun} exists.`,
      `The note for ${noun} says what is done and what is still open.`,
    ),
  ];
};

export const expandOutcome = (raw: string, title: string) => {
  const text = unwrapGeneric(raw) || normalize(title);
  if (GENERIC.test(text) || TEMPLATE.test(text)) {
    const heading = normalize(title);
    const subject = !heading || GENERIC.test(heading) || TEMPLATE.test(heading) ? "this step" : heading;
    return plainActions(subject);
  }
  const clauses = splitClauses(text);
  if (clauses.length >= 2) return clauses.slice(0, 5).map((clause) => actionForClause(clause));
  const clause = clauses[0] || normalize(title);
  const signed = clause.match(/^(.+?)\s+signed\s+by\s+(.+)$/i);
  if (signed) return signedSteps(signed[1], signed[2]);
  if (/\s+approved$/i.test(clause)) return approvedSequence(clause.replace(/\s+approved$/i, ""));
  if (/\s+held$/i.test(clause)) return heldSequence(clause.replace(/\s+held$/i, ""));
  const primary = actionForClause(clause);
  const label = clause.trim().replace(/\.$/, "").slice(0, 120);
  return [
    primary,
    item(
      `Check the result against “${label}” and write what is done and what is still open.`,
      "The step is finished when you can show the result, not when the heading sounds done.",
      "A short note says what is done and what is still open.",
    ),
  ];
};

const focusFrom = (tasks: Array<{ text?: string }>) => {
  const texts = tasks.map((task) => clean(task.text).replace(/\.$/, "")).filter(Boolean);
  if (texts.length >= 2) {
    const second = texts[1][0].toLowerCase() + texts[1].slice(1);
    return `${texts[0]}. Then ${second}.`.slice(0, 500);
  }
  return (texts[0] || "").slice(0, 500);
};

const weakCopy = (value: string, title: string) => {
  const text = clean(value);
  if (!text || GENERIC.test(text)) return true;
  return Boolean(title) && (echoes(title, text) || text.toLowerCase().startsWith(`${title.toLowerCase()}:`));
};

const doneDay = (day: Dict) => Boolean(clean(day.completedOn)) || clean(day.status).toLowerCase() === "skipped";

export const clarifyDay = (day: Dict, _index = 0): Dict => day;

const _clarifyDayTemplates = (day: Dict, index = 0): Dict => {
  if (doneDay(day)) return day;
  const title = clean(day.title) || `Step ${index + 1}`;
  const original = (Array.isArray(day.tasks) ? day.tasks : []).filter(
    (task): task is Dict => Boolean(task) && typeof task === "object" && Boolean(clean((task as Dict).text)),
  );
  const clear = original.filter((task) => isClearAction(clean(task.text), title));
  if (original.length > 0 && clear.length === original.length && clear.length >= 2) {
    const next = { ...day };
    if (weakCopy(clean(day.focus), title)) next.focus = focusFrom(original as Array<{ text?: string }>);
    if (weakCopy(clean(day.definitionOfDone), title)) {
      const done = clean(original[original.length - 1].definitionOfDone);
      if (done && !weakCopy(done, title)) next.definitionOfDone = done;
    }
    return next;
  }

  const built: Dict[] = [];
  const sources = original.length ? original : [{ text: title, done: false }];
  for (const task of sources) {
    const sourceText = clean(task.text) || title;
    if (isClearAction(sourceText, title)) {
      built.push({ ...task });
      continue;
    }
    expandOutcome(sourceText, title).forEach((action, actionIndex) => {
      built.push({
        text: action.text,
        done: Boolean(task.done),
        why: action.why,
        definitionOfDone: action.definitionOfDone,
        note: actionIndex === 0 ? clean(task.note) : "",
      });
    });
  }
  const deduped: Dict[] = [];
  const seen = new Set<string>();
  for (const task of built) {
    const key = clean(task.text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(task);
    if (deduped.length >= 5) break;
  }
  if (!deduped.length) return day;
  const dayId = clean(day.id) || `day-${index + 1}`;
  const oldTexts = original.map((task) => clean(task.text));
  const newTexts = deduped.map((task) => clean(task.text));
  const changedTexts = oldTexts.join("\n") !== newTexts.join("\n");
  deduped.forEach((task, taskIndex) => {
    const previous = original[taskIndex];
    task.id = !changedTexts && previous && clean(previous.id) ? previous.id : `${dayId}-t${taskIndex + 1}`;
    task.done = Boolean(task.done);
  });
  return {
    ...day,
    tasks: deduped,
    focus: focusFrom(deduped as Array<{ text?: string }>),
    definitionOfDone: clean(deduped[deduped.length - 1].definitionOfDone) || clean(day.definitionOfDone),
  };
};

export const clarifyStoredPlan = (plan: Dict) => ({
  plan: JSON.parse(JSON.stringify(plan)) as Dict,
  changed: false,
});

const _clarifyStoredPlanTemplates = (plan: Dict) => {
  const copy = JSON.parse(JSON.stringify(plan)) as Dict;
  const days = Array.isArray(copy.days) ? (copy.days as Dict[]) : [];
  const before = JSON.stringify(days);
  copy.days = days.map((day, index) => _clarifyDayTemplates(day, index));
  return { plan: copy, changed: JSON.stringify(copy.days) !== before };
};

const GENERIC_SUBJECTS = new Set([
  "learn a skill",
  "learn the skill",
  "learn skill",
  "a skill",
  "skill",
  "new goal",
  "goal",
  "my goal",
  "this goal",
]);

const asDict = (value: unknown): Dict =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};

const usableSubject = (value: unknown) => {
  const text = clean(value);
  if (!text || text.toUpperCase() === "UNKNOWN" || GENERIC_SUBJECTS.has(text.toLowerCase())) return "";
  if (text.toLowerCase().startsWith("learn a skill")) return "";
  return text.slice(0, 80);
};

const namedSkill = (goal: Dict) => {
  const profile = asDict(goal.contextProfile);
  const understanding = asDict(goal.understanding);
  for (const candidate of [goal.description, profile.description, profile.subject, understanding.subdomain, goal.category]) {
    const cleaned = usableSubject(candidate);
    if (cleaned) return cleaned;
  }
  const title = usableSubject(goal.title);
  return title && !title.toLowerCase().includes("learn a skill") ? title : "";
};

const stageOf = (goal: Dict) => {
  const profile = asDict(goal.contextProfile);
  const understanding = asDict(goal.understanding);
  const level = clean(profile.startingLevel || profile.currentRole);
  const text = (level || clean(understanding.startingLevel) || clean(goal.statement)).toLowerCase().replace(/^[.\s]+|[.\s]+$/g, "");
  if (!text || text === "unknown") return "beginner";
  if (["some", "using", "regular", "started", "already started"].includes(text)) return "started";
  if (["zero", "new", "beginner", "from zero"].includes(text)) return "beginner";
  if (/already|some practice|intermediate|advanced|expert|underway|not a beginner/.test(text)) return "started";
  if (/beginner|from zero|not started|new to|never|scratch|\bzero\b/.test(text)) return "beginner";
  return "beginner";
};

const isSkillGoal = (goal: Dict) => {
  if (clean(goal.goalType).toLowerCase() === "skill") return true;
  const blob = `${clean(goal.statement)} ${clean(goal.title)} ${clean(goal.description)}`.toLowerCase();
  if (/\b(career|promotion|hired|interview)\b/.test(blob)) return false;
  return /\b(learn|skill|study|course)\b/.test(blob);
};

const spanFrom = (blob: string) => {
  const source = blob.toLowerCase().replace(/(\d+)\s*-\s*(day|week|month|year)/g, "$1 $2");
  if (!source.trim()) return 0;
  if (/\b(no fixed|not sure)\b/.test(source)) return 90;
  const years = source.match(/(\d+)\s*years?/);
  if (years) return Math.max(Number(years[1]) || 1, 1) * 365;
  if (/\b(a year|within a year)\b/.test(source)) return 365;
  if (/\b(a few months|few months)\b/.test(source)) return 90;
  if (/\b(a month|one month)\b/.test(source)) return 30;
  const months = source.match(/(\d+)\s*months?/);
  if (months) return Math.max(Number(months[1]) || 1, 1) * 30;
  const weeks = source.match(/(\d+)\s*weeks?/);
  if (weeks) return Math.max(Number(weeks[1]) || 1, 1) * 7;
  const days = source.match(/(\d+)\s*days?/);
  if (days) return Math.max(Number(days[1]) || 1, 1);
  return 0;
};

const statedSpan = (goal: Dict) => {
  const profile = asDict(goal.contextProfile);
  const chosen = spanFrom(`${clean(goal.timeframe)} ${clean(profile.timeframe)}`);
  return chosen || spanFrom(clean(goal.statement));
};

const hoursLabel = (goal: Dict) => {
  const profile = asDict(goal.contextProfile);
  const value = Number(goal.availableHoursPerWeek ?? profile.availableHoursPerWeek);
  if (!Number.isFinite(value) || value <= 0 || value > 168) return "";
  return Number.isInteger(value) ? String(value) : String(value);
};

const dayBlob = (plan: Dict) => {
  const days = Array.isArray(plan.days) ? (plan.days as Dict[]) : [];
  return days
    .flatMap((day) => [
      clean(day.title),
      clean(day.focus),
      ...(Array.isArray(day.tasks) ? (day.tasks as Dict[]).map((task) => clean(task.text)) : []),
    ])
    .join(" ")
    .toLowerCase();
};

const goalBlob = (goal: Dict) => {
  const profile = asDict(goal.contextProfile);
  return `${clean(goal.statement)} ${clean(goal.title)} ${clean(goal.description)} ${clean(goal.successCriteria)} ${clean(profile.description)} ${clean(profile.startingLevel)}`.toLowerCase();
};

const mentionsSkill = (plan: Dict, skill: string) => {
  const stop = new Set(["learn", "skill", "this", "that", "with", "your", "from", "have", "will", "want", "able", "when", "into", "about", "goal", "the", "and", "for"]);
  const words = (skill.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length >= 3 && !stop.has(word));
  if (!words.length) return true;
  const blob = dayBlob(plan);
  return words.some((word) => blob.includes(word));
};

const dayIsDone = (day: Dict) => Boolean(clean(day.completedOn)) || ["done", "skipped"].includes(clean(day.status).toLowerCase());

const blockCount = (span: number) => (span >= 45 ? 8 : span >= 21 ? 6 : 4);

const calendarSlots = (count: number, span: number) => {
  if (count <= 0) return [];
  const width = Math.max(span, count);
  if (count === 1) return [1];
  const slots: number[] = [];
  let last = 0;
  for (let index = 0; index < count; index += 1) {
    let slot = 1 + Math.round((index * (width - 1)) / (count - 1));
    slot = Math.min(width, Math.max(slot, last + 1));
    slots.push(slot);
    last = slot;
  }
  slots[slots.length - 1] = width;
  return slots;
};

const addIsoDays = (iso: string, days: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

type Block = { title: string; actions: string[] };

const withHours = (actions: string[], goal: Dict, subject: string) => {
  const hours = hoursLabel(goal);
  if (!hours || actions.length >= 4) return actions;
  return [...actions, `Schedule this block inside the ${hours} hours you can give this week for ${subject}`];
};

const beginnerBlocks = (subject: string, goal: Dict): Block[] => {
  const s = subject;
  return [
    {
      title: `See where you are with ${s}`,
      actions: withHours(
        [
          `List what you can and cannot do yet with ${s}`,
          `Write the result you want from ${s} by the end of this plan`,
          `Pick the first small piece of ${s} you will practice next`,
        ],
        goal,
        s,
      ),
    },
    {
      title: `Learn the first fundamentals of ${s}`,
      actions: [
        `Study one core idea in ${s} and write it in your own words`,
        `List three moves in ${s} you need before you practice`,
        `Note what is still confusing about ${s}`,
      ],
    },
    {
      title: `Practice the fundamentals of ${s}`,
      actions: [
        `Practice the first move in ${s} until you can repeat it`,
        `Record what went wrong in ${s} and what you will repeat`,
        `Compare this attempt with the idea you wrote down for ${s}`,
      ],
    },
    {
      title: `Learn the next piece of ${s}`,
      actions: [
        `Study the next piece of ${s} that builds on the first`,
        `Write how this piece of ${s} connects to the first idea`,
        `List one exercise that uses only this new piece of ${s}`,
      ],
    },
    {
      title: `Practice that next piece of ${s}`,
      actions: [
        `Practice the new piece of ${s} on a short exercise`,
        `Check the ${s} result and write what still breaks`,
        `Run the ${s} exercise once more after you fix that break`,
      ],
    },
    {
      title: `Make a small proof with ${s}`,
      actions: [
        `Define a small proof you can finish with ${s}`,
        `Build that proof using the pieces of ${s} you have practiced`,
        `Write what the proof shows about your ${s}`,
      ],
    },
    {
      title: `Get feedback on your ${s}`,
      actions: [
        `Ask someone to look at the ${s} proof and say what is unclear`,
        `Write the feedback about ${s} in their words`,
        `Fix the one issue they named in the ${s} proof`,
      ],
    },
    {
      title: `Finish the ${s} proof`,
      actions: [
        `Review the ${s} proof against the result you wrote at the start`,
        `Finish the remaining piece of the ${s} proof`,
        `Show the proof and write what you can now do with ${s}`,
      ],
    },
  ];
};

const startedBlocks = (subject: string, goal: Dict): Block[] => {
  const s = subject;
  return [
    {
      title: `Name the gap in ${s}`,
      actions: withHours(
        [
          `Write what you already do with ${s}`,
          `Name the one gap between that and the result you want from ${s}`,
          `Pick the next piece of ${s} that is past the work you already do`,
        ],
        goal,
        s,
      ),
    },
    {
      title: `Practice the next piece of ${s}`,
      actions: [
        `Practice that next piece of ${s} on work you already do`,
        `Record where your current ${s} still breaks`,
        `Run one more attempt at that piece of ${s}`,
      ],
    },
    {
      title: `Use ${s} on work you already do`,
      actions: [
        `Apply the new piece of ${s} to something you already make`,
        `Compare it with your earlier work in ${s}`,
        `Note what improved in ${s} and what did not`,
      ],
    },
    {
      title: `Push the weak part of ${s}`,
      actions: [
        `Practice the weak part of ${s} that the comparison showed`,
        `Write the change you want to see in the next attempt at ${s}`,
        `Run one more attempt and mark the difference in ${s}`,
      ],
    },
    {
      title: `Make a proof of the new ${s}`,
      actions: [
        `Define a small proof that needs the new ${s}, not the work you already do`,
        `Build that proof with ${s}`,
        `Write what a viewer should notice in the ${s} proof`,
      ],
    },
    {
      title: `Get feedback on the new ${s}`,
      actions: [
        `Ask someone who knows your work to review the ${s} proof`,
        `Write what they said was still missing from ${s}`,
        `Fix that missing piece in the ${s} proof`,
      ],
    },
    {
      title: `Tighten the ${s} proof`,
      actions: [
        `Review the proof and remove anything that does not show the new ${s}`,
        `Practice the part of ${s} that still feels shaky`,
        `Update the proof with that practice of ${s}`,
      ],
    },
    {
      title: `Finish and show the ${s} work`,
      actions: [
        `Check the proof against the result you wanted from ${s}`,
        `Finish the last open piece of the ${s} proof`,
        `Show the finished ${s} work and write what you can do now that you could not do at the start`,
      ],
    },
  ];
};

const selectBlocks = (blocks: Block[], count: number) => {
  if (count >= blocks.length) return blocks;
  const pick = (indexes: number[]) => indexes.filter((index) => index < blocks.length).map((index) => blocks[index]);
  if (count >= 6 && blocks.length >= 8) return pick([0, 1, 2, 5, 6, 7]);
  if (count >= 4 && blocks.length >= 8) return pick([0, 2, 5, 7]);
  if (count >= 4 && blocks.length >= 6) return pick([0, 1, 4, 5]);
  return blocks.slice(0, count);
};

const shouldReplace = (plan: Dict, goal: Dict) => {
  if (!isSkillGoal(goal)) return false;
  const span = statedSpan(goal);
  if (span < 14) return false;
  const days = (Array.isArray(plan.days) ? (plan.days as Dict[]) : []).filter((day) => day && typeof day === "object");
  if (days.some(dayIsDone)) return false;
  const open = days.filter((day) => !dayIsDone(day));
  if (open.length <= 1) return true;
  if (TEMPLATE.test(dayBlob(plan)) && !TEMPLATE.test(goalBlob(goal))) return true;
  const skill = namedSkill(goal);
  if (skill && open.length < 6 && !mentionsSkill(plan, skill)) return true;
  return false;
};

const clearCannedNotes = (plan: Dict, goal: Dict) => {
  if (TEMPLATE.test(goalBlob(goal))) return false;
  let changed = false;
  if (TEMPLATE.test(clean(plan.coachNote))) {
    plan.coachNote = "";
    changed = true;
  }
  if (TEMPLATE.test(clean(plan.immediateNextStep))) {
    plan.immediateNextStep = "";
    changed = true;
  }
  return changed;
};

export const repairThinStoredPlan = (plan: Dict, _goal: Dict = {}, _startDate = "") => ({
  plan: JSON.parse(JSON.stringify(plan)) as Dict,
  changed: false,
});

const _repairThinStoredPlanTemplates = (plan: Dict, goal: Dict = {}, startDate = "") => {
  const copy = JSON.parse(JSON.stringify(plan)) as Dict;
  if (!shouldReplace(copy, goal)) {
    const days = Array.isArray(copy.days) ? (copy.days as Dict[]) : [];
    if (days.some(dayIsDone)) return { plan: copy, changed: false };
    return { plan: copy, changed: clearCannedNotes(copy, goal) };
  }
  const span = statedSpan(goal);
  const subject = namedSkill(goal) || "this skill";
  const catalog = stageOf(goal) === "started" ? startedBlocks(subject, goal) : beginnerBlocks(subject, goal);
  const chosen = selectBlocks(catalog, blockCount(span));
  const slots = calendarSlots(chosen.length, span);
  const minutes = (() => {
    const hours = Number(hoursLabel(goal));
    if (!hours) return 50;
    return Math.max(30, Math.min(90, Math.round((hours * 60) / 4)));
  })();
  copy.days = chosen.map((block, index) => {
    const slot = slots[index] || index + 1;
    const tasks = block.actions.slice(0, 4).map((text, taskIndex) => ({
      id: `step-${index + 1}-t${taskIndex + 1}`,
      text: text.endsWith(".") ? text : `${text}.`,
      done: false,
      why: `This is the next concrete move for ${subject}.`,
      definitionOfDone: `Done when this is finished and you can check it: ${text}.`.slice(0, 240),
      note: "",
    }));
    const scheduled = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? addIsoDays(startDate, slot - 1) : "";
    return {
      id: `step-${index + 1}`,
      dayIndex: index + 1,
      scheduleDay: slot,
      scheduledDate: scheduled,
      dateLabel: "",
      title: block.title.slice(0, 160),
      focus: tasks.map((task) => task.text.replace(/\.$/, "")).slice(0, 2).join(". Then "),
      minutes,
      status: "open",
      tasks,
      definitionOfDone: tasks[tasks.length - 1]?.definitionOfDone || "",
    };
  });
  copy.horizonDays = span;
  copy.milestones = (copy.days as Dict[]).map((day, index, all) => ({
    title: day.title,
    successCriteria: (day.tasks as Dict[]).map((task) => task.text).slice(0, 3),
    dueLabel: `Day ${day.scheduleDay}`,
    dependencies: index ? [all[index - 1].title] : [],
  }));
  if (!TEMPLATE.test(goalBlob(goal))) {
    if (TEMPLATE.test(clean(copy.coachNote))) copy.coachNote = "";
    if (TEMPLATE.test(clean(copy.immediateNextStep))) copy.immediateNextStep = "";
  }
  const first = ((copy.days as Dict[])[0]?.tasks as Dict[] | undefined)?.[0];
  if (first && !clean(copy.coachNote)) copy.coachNote = clean(first.text);
  if (first && !clean(copy.immediateNextStep)) copy.immediateNextStep = clean(first.text);
  return { plan: copy, changed: true };
};
