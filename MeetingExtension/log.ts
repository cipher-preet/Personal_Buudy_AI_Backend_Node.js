type LogFields = Record<string, string | number | boolean | null | undefined>;

const REDACT_KEYS = new Set([
  "token",
  "authorization",
  "uploadurl",
  "url",
  "presignedurl",
]);

export const logMeetingEvent = (event: string, fields: LogFields = {}) => {
  const payload: Record<string, unknown> = {
    event,
    sourceType: "meeting_extension",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    if (REDACT_KEYS.has(key.toLowerCase())) {
      continue;
    }
    payload[key] = value;
  }
  console.log(JSON.stringify(payload));
};
