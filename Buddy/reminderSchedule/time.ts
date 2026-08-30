import { DEFAULT_REMINDER_TIMEZONE } from "./constants.js";

const TIME_LABEL_PATTERN = /^(1[0-2]|[1-9]):([0-5]\d)\s?(AM|PM)$/i;

export const parseTimeLabel = (timeLabel: string) => {
  const match = timeLabel.trim().match(TIME_LABEL_PATTERN);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour < 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
};

const tzParts = (instantMs: number, timeZone: string) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]),
    );
    let hour = Number(parts.hour);
    if (hour === 24) {
      hour = 0;
    }
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour,
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return null;
  }
};

const offsetMsAt = (instantMs: number, timeZone: string) => {
  const parts = tzParts(instantMs, timeZone);
  if (!parts) {
    return null;
  }

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instantMs;
};

export const zonedLocalToUtc = (
  dateKey: string,
  timeLabel: string,
  timeZone = DEFAULT_REMINDER_TIMEZONE,
): Date | null => {
  const dateMatch = dateKey.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedTime = parseTimeLabel(timeLabel);
  if (!dateMatch || !parsedTime) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const zone = timeZone.trim() || DEFAULT_REMINDER_TIMEZONE;
  const intendedUtc = Date.UTC(year, month - 1, day, parsedTime.hour, parsedTime.minute, 0);
  const offset1 = offsetMsAt(intendedUtc, zone);
  if (offset1 == null) {
    return null;
  }

  const instant = intendedUtc - offset1;
  const offset2 = offsetMsAt(instant, zone);
  if (offset2 == null) {
    return null;
  }

  return new Date(intendedUtc - offset2);
};

export const occurrenceIdFor = (reminderId: string, occurrenceAtUtc: Date) =>
  `${reminderId}:${toOccurrenceUtcKey(occurrenceAtUtc)}`;

export const toOccurrenceUtcKey = (occurrenceAtUtc: Date) =>
  occurrenceAtUtc.toISOString().replace(/\.\d{3}Z$/, "Z");

export const daysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const addRepeatInTimeZone = (
  occurrenceAtUtc: Date,
  repeat: string,
  timeZone: string,
): Date | null => {
  const parts = tzParts(occurrenceAtUtc.getTime(), timeZone);
  if (!parts) {
    return null;
  }

  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  const weekday = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0),
  ).getUTCDay();

  if (repeat === "daily") {
    day += 1;
  } else if (repeat === "weekly") {
    day += 7;
  } else if (repeat === "weekdays") {
    day += weekday === 5 ? 3 : weekday === 6 ? 2 : 1;
  } else if (repeat === "monthly") {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    day = Math.min(day, daysInMonth(year, month - 1));
  } else {
    return null;
  }

  const overflow = new Date(Date.UTC(year, month - 1, day));
  const dateKey = overflow.toISOString().slice(0, 10);
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const period = parts.hour >= 12 ? "PM" : "AM";
  const timeLabel = `${hour12}:${String(parts.minute).padStart(2, "0")} ${period}`;
  return zonedLocalToUtc(dateKey, timeLabel, timeZone);
};

export const computeNextTriggerAtUtc = (input: {
  dateKey: string;
  timeLabel: string;
  timeZone?: string;
  repeat: string;
  after?: Date;
}): Date | null => {
  const timeZone = input.timeZone?.trim() || DEFAULT_REMINDER_TIMEZONE;
  let candidate = zonedLocalToUtc(input.dateKey, input.timeLabel, timeZone);
  if (!candidate) {
    return null;
  }

  const after = input.after ?? new Date(0);
  if (candidate.getTime() > after.getTime() || input.repeat === "once") {
    return candidate;
  }

  for (let index = 0; index < 400; index += 1) {
    const next = addRepeatInTimeZone(candidate, input.repeat, timeZone);
    if (!next || next.getTime() <= candidate.getTime()) {
      return null;
    }
    candidate = next;
    if (candidate.getTime() > after.getTime()) {
      return candidate;
    }
  }

  return null;
};
