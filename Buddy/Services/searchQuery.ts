import { DEFAULT_REMINDER_TIMEZONE } from "../reminderSchedule/constants.js";
import { dateKeyInTimeZone } from "../reminderSchedule/time.js";

export const SEARCH_TYPES = ["space", "task", "note", "meeting", "event"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export type SearchDateRange = {
  /** Inclusive local date keys (YYYY-MM-DD) in the user's timezone. */
  from: string;
  to: string;
  label: string;
};

export type SearchStatus = "done" | "open" | "overdue";
export type SearchPriority = "high" | "medium" | "low";

export type ParsedSearchQuery = {
  raw: string;
  terms: string[];
  types: SearchType[];
  dateRange: SearchDateRange | null;
  /** Minutes after local midnight. */
  timeMinutes: number | null;
  timeLabel: string | null;
  status: SearchStatus | null;
  priority: SearchPriority | null;
};

const TYPE_WORDS: Record<string, SearchType> = {
  task: "task",
  tasks: "task",
  todo: "task",
  todos: "task",
  "to-do": "task",
  "to-dos": "task",
  note: "note",
  notes: "note",
  meeting: "meeting",
  meetings: "meeting",
  recording: "meeting",
  recordings: "meeting",
  call: "meeting",
  calls: "meeting",
  space: "space",
  spaces: "space",
  workspace: "space",
  workspaces: "space",
  event: "event",
  events: "event",
  calendar: "event",
  schedule: "event",
};

const STOPWORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "of", "to", "from", "with",
  "about", "my", "me", "show", "find", "search", "all", "and", "or", "is",
  "was", "were", "during", "by", "created", "due", "what", "which", "did",
  "i", "any", "that", "this", "those", "these", "between", "around", "list",
]);

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4,
  april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5,
  friday: 5, sat: 6, saturday: 6,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WEEKDAY_NAMES = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (value: number) => String(value).padStart(2, "0");

const toKey = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const keyParts = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
};

export const addDaysToKey = (key: string, days: number) => {
  const { year, month, day } = keyParts(key);
  return toKey(year, month, day + days);
};

const weekdayOfKey = (key: string) => {
  const { year, month, day } = keyParts(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const isValidDate = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const formatKeyLabel = (key: string) => {
  const { year, month, day } = keyParts(key);
  return `${day} ${MONTH_LABELS[month - 1]} ${year}`;
};

const singleDay = (key: string, label?: string): SearchDateRange => ({
  from: key,
  to: key,
  label: label ?? formatKeyLabel(key),
});

const monthRange = (year: number, month: number, label?: string): SearchDateRange => ({
  from: toKey(year, month, 1),
  to: toKey(year, month, lastDayOfMonth(year, month)),
  label: label ?? `${MONTH_LABELS[month - 1]} ${year}`,
});

/** Weeks start on Monday. */
const weekRange = (todayKey: string, offsetWeeks: number, label: string): SearchDateRange => {
  const mondayOffset = (weekdayOfKey(todayKey) + 6) % 7;
  const monday = addDaysToKey(todayKey, -mondayOffset + offsetWeeks * 7);
  return { from: monday, to: addDaysToKey(monday, 6), label };
};

/** Without an explicit year, prefer the most recent occurrence unless it is far in the future. */
const resolveYearless = (todayKey: string, month: number, day: number) => {
  const today = keyParts(todayKey);
  const candidate = toKey(today.year, month, day);
  const daysAhead =
    (Date.UTC(today.year, month - 1, day) - Date.UTC(today.year, today.month - 1, today.day)) /
    86_400_000;
  return daysAhead > 183 ? toKey(today.year - 1, month, day) : candidate;
};

const parseClock = (hourText: string, minuteText: string | undefined, period: string | undefined) => {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isFinite(hour) || minute > 59) {
    return null;
  }
  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    const isPm = period.toLowerCase().startsWith("p");
    if (hour === 12) {
      hour = isPm ? 12 : 0;
    } else if (isPm) {
      hour += 12;
    }
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
};

export const formatMinutesLabel = (minutes: number) => {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad(minute)} ${period}`;
};

type Extractor = {
  pattern: RegExp;
  apply: (match: RegExpMatchArray, todayKey: string) => SearchDateRange | null;
};

const DATE_EXTRACTORS: Extractor[] = [
  {
    pattern: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
    apply: (m) => {
      const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return isValidDate(year, month, day) ? singleDay(toKey(year, month, day)) : null;
    },
  },
  {
    pattern: /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/,
    apply: (m, todayKey) => {
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (!m[3]) {
        return isValidDate(2000, month, day) ? singleDay(resolveYearless(todayKey, month, day)) : null;
      }
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return isValidDate(year, month, day) ? singleDay(toKey(year, month, day)) : null;
    },
  },
  {
    pattern: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\b(?:,?\\s+(\\d{4}))?`,
    ),
    apply: (m, todayKey) => {
      const day = Number(m[1]);
      const month = MONTHS[m[2]];
      if (m[3]) {
        const year = Number(m[3]);
        return isValidDate(year, month, day) ? singleDay(toKey(year, month, day)) : null;
      }
      return isValidDate(2000, month, day) ? singleDay(resolveYearless(todayKey, month, day)) : null;
    },
  },
  {
    pattern: new RegExp(
      `\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`,
    ),
    apply: (m, todayKey) => {
      const month = MONTHS[m[1]];
      const day = Number(m[2]);
      if (m[3]) {
        const year = Number(m[3]);
        return isValidDate(year, month, day) ? singleDay(toKey(year, month, day)) : null;
      }
      return isValidDate(2000, month, day) ? singleDay(resolveYearless(todayKey, month, day)) : null;
    },
  },
  {
    pattern: /\b(today|tonight)\b/,
    apply: (_m, todayKey) => singleDay(todayKey, "Today"),
  },
  {
    pattern: /\byesterday\b/,
    apply: (_m, todayKey) => singleDay(addDaysToKey(todayKey, -1), "Yesterday"),
  },
  {
    pattern: /\btomorrow\b/,
    apply: (_m, todayKey) => singleDay(addDaysToKey(todayKey, 1), "Tomorrow"),
  },
  {
    pattern: /\b(this|last|past|previous|next)\s+week\b/,
    apply: (m, todayKey) => {
      if (m[1] === "this") return weekRange(todayKey, 0, "This week");
      if (m[1] === "next") return weekRange(todayKey, 1, "Next week");
      return weekRange(todayKey, -1, "Last week");
    },
  },
  {
    pattern: /\b(this|last|past|previous|next)\s+month\b/,
    apply: (m, todayKey) => {
      const { year, month } = keyParts(todayKey);
      if (m[1] === "this") return monthRange(year, month, "This month");
      const offset = m[1] === "next" ? 1 : -1;
      const shifted = keyParts(toKey(year, month + offset, 1));
      return monthRange(shifted.year, shifted.month, offset > 0 ? "Next month" : "Last month");
    },
  },
  {
    pattern: /\b(?:last|past)\s+(\d{1,3})\s+days?\b/,
    apply: (m, todayKey) => {
      const days = Math.min(Math.max(Number(m[1]), 1), 365);
      return { from: addDaysToKey(todayKey, -(days - 1)), to: todayKey, label: `Last ${days} days` };
    },
  },
  {
    pattern: /\b(\d{1,3})\s+days?\s+ago\b/,
    apply: (m, todayKey) => {
      const days = Math.min(Number(m[1]), 365);
      return singleDay(addDaysToKey(todayKey, -days));
    },
  },
  {
    pattern: new RegExp(`\\b(?:(last|next|this)\\s+)?(${WEEKDAY_NAMES})\\b`),
    apply: (m, todayKey) => {
      const target = WEEKDAYS[m[2]];
      const current = weekdayOfKey(todayKey);
      let key: string;
      if (m[1] === "next") {
        key = addDaysToKey(todayKey, ((target - current + 7) % 7) || 7);
      } else if (m[1] === "last") {
        key = addDaysToKey(todayKey, -(((current - target + 7) % 7) || 7));
      } else if (m[1] === "this") {
        key = addDaysToKey(todayKey, (target - current + 7) % 7);
      } else {
        key = addDaysToKey(todayKey, -((current - target + 7) % 7));
      }
      return singleDay(key);
    },
  },
  {
    // "may" alone is too common as a word; require a year or "in".
    pattern: new RegExp(`\\b(?:in\\s+)?(${MONTH_NAMES})(?:\\s+(\\d{4}))?\\b`),
    apply: (m, todayKey) => {
      const isBareMay = m[1] === "may" && !m[2] && !m[0].startsWith("in");
      if (isBareMay) {
        return null;
      }
      const month = MONTHS[m[1]];
      const today = keyParts(todayKey);
      const year = m[2] ? Number(m[2]) : month > today.month ? today.year - 1 : today.year;
      return monthRange(year, month);
    },
  },
];

const TIME_PATTERNS: Array<{ pattern: RegExp; read: (m: RegExpMatchArray) => number | null }> = [
  {
    pattern: /\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$|[^a-z])/,
    read: (m) => parseClock(m[1], m[2], m[3]),
  },
  {
    pattern: /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/,
    read: (m) => parseClock(m[1], m[2], undefined),
  },
  { pattern: /\bnoon\b/, read: () => 12 * 60 },
  { pattern: /\bmidnight\b/, read: () => 0 },
];

const STATUS_PATTERNS: Array<{ pattern: RegExp; status: SearchStatus }> = [
  { pattern: /\boverdue\b/, status: "overdue" },
  { pattern: /\b(done|completed|finished)\b/, status: "done" },
  { pattern: /\b(pending|incomplete|unfinished|open\s+tasks?)\b/, status: "open" },
];

const PRIORITY_PATTERNS: Array<{ pattern: RegExp; priority: SearchPriority }> = [
  { pattern: /\b(?:high\s+priority|priority\s*:?\s*high|urgent|p1)\b/, priority: "high" },
  { pattern: /\b(?:medium\s+priority|priority\s*:?\s*medium|p2)\b/, priority: "medium" },
  { pattern: /\b(?:low\s+priority|priority\s*:?\s*low|p3)\b/, priority: "low" },
];

const cut = (text: string, match: RegExpMatchArray) =>
  `${text.slice(0, match.index)} ${text.slice((match.index ?? 0) + match[0].length)}`;

export const MAX_QUERY_LENGTH = 120;

export const parseSearchQuery = (
  rawInput: string,
  options: { now?: Date; timeZone?: string } = {},
): ParsedSearchQuery => {
  const raw = rawInput.trim().slice(0, MAX_QUERY_LENGTH);
  const timeZone = options.timeZone?.trim() || DEFAULT_REMINDER_TIMEZONE;
  const todayKey =
    dateKeyInTimeZone(options.now ?? new Date(), timeZone) ??
    dateKeyInTimeZone(options.now ?? new Date()) ??
    new Date().toISOString().slice(0, 10);

  let text = ` ${raw.toLowerCase().replace(/\s+/g, " ")} `;
  const types = new Set<SearchType>();

  text = text.replace(/\b(?:type|in|is):(\w+)/g, (whole, word: string) => {
    const type = TYPE_WORDS[word];
    if (type) {
      types.add(type);
      return " ";
    }
    return whole;
  });

  let timeMinutes: number | null = null;
  for (const { pattern, read } of TIME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const minutes = read(match);
      if (minutes !== null) {
        timeMinutes = minutes;
        text = cut(text, match);
        break;
      }
    }
  }

  let dateRange: SearchDateRange | null = null;
  for (const extractor of DATE_EXTRACTORS) {
    const match = text.match(extractor.pattern);
    if (!match) {
      continue;
    }
    const range = extractor.apply(match, todayKey);
    if (range) {
      dateRange = range;
      text = cut(text, match);
      break;
    }
  }

  let priority: SearchPriority | null = null;
  for (const entry of PRIORITY_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match) {
      priority = entry.priority;
      text = cut(text, match);
      break;
    }
  }

  let status: SearchStatus | null = null;
  for (const entry of STATUS_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match) {
      status = entry.status;
      text = cut(text, match);
      break;
    }
  }

  const terms: string[] = [];
  for (const token of text.split(/\s+/)) {
    const word = token.replace(/^[^\p{L}\p{N}#@]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word) {
      continue;
    }
    const type = TYPE_WORDS[word];
    if (type) {
      types.add(type);
      continue;
    }
    if (STOPWORDS.has(word) || terms.includes(word)) {
      continue;
    }
    terms.push(word);
  }

  if ((status || priority) && types.size === 0) {
    types.add("task");
  }

  return {
    raw,
    terms: terms.slice(0, 8),
    types: SEARCH_TYPES.filter((type) => types.has(type)),
    dateRange,
    timeMinutes,
    timeLabel: timeMinutes === null ? null : formatMinutesLabel(timeMinutes),
    status,
    priority,
  };
};

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordBoundaryRegexCache = new Map<string, RegExp>();
const wordStartRegex = (term: string) => {
  let regex = wordBoundaryRegexCache.get(term);
  if (!regex) {
    regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(term)}`, "iu");
    wordBoundaryRegexCache.set(term, regex);
    if (wordBoundaryRegexCache.size > 500) {
      wordBoundaryRegexCache.clear();
    }
  }
  return regex;
};

/** Higher is better. Title matches dominate; recency breaks ties. */
export const scoreSearchMatch = ({
  terms,
  phrase,
  title,
  body,
  ageDays,
}: {
  terms: string[];
  phrase: string;
  title: string;
  body: string;
  ageDays: number | null;
}) => {
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    if (lowerTitle === term) {
      score += 20;
    } else if (wordStartRegex(term).test(lowerTitle)) {
      score += 10;
    } else if (lowerTitle.includes(term)) {
      score += 6;
    } else if (wordStartRegex(term).test(lowerBody)) {
      score += 3;
    } else if (lowerBody.includes(term)) {
      score += 2;
    } else {
      continue;
    }
    matchedTerms += 1;
  }

  if (terms.length > 1 && phrase) {
    if (lowerTitle.includes(phrase)) {
      score += 12;
    } else if (lowerBody.includes(phrase)) {
      score += 4;
    }
  }
  if (phrase && lowerTitle.startsWith(phrase)) {
    score += 6;
  }

  if (ageDays !== null && Number.isFinite(ageDays)) {
    score += 6 * Math.exp(-Math.abs(ageDays) / 30);
  }

  return { score, matchedTerms };
};

export const buildSnippet = (text: string, terms: string[], maxLength = 140) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }
  if (clean.length <= maxLength) {
    return clean;
  }
  const lower = clean.toLowerCase();
  let firstHit = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (firstHit === -1 || index < firstHit)) {
      firstHit = index;
    }
  }
  if (firstHit <= 40) {
    return `${clean.slice(0, maxLength).trimEnd()}…`;
  }
  const start = Math.max(0, firstHit - 40);
  const end = Math.min(clean.length, start + maxLength);
  return `…${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
};
