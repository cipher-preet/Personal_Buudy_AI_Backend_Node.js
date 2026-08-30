export type ReminderRedisTarget = {
  host: string;
  port: string;
  tls: boolean;
};

export const describeReminderRedisUrl = (url: string): ReminderRedisTarget => {
  const parsed = new URL(url);
  const tls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: parsed.port || (tls ? "6380" : "6379"),
    tls,
  };
};

export const formatReminderRedisTarget = (target: ReminderRedisTarget) =>
  `host=${target.host} port=${target.port} tls=${target.tls ? "true" : "false"}`;

export const redactRedisSecrets = (message: string) =>
  message.replace(/redis(s)?:\/\/[^\s"'\\]+/gi, "redis://<redacted>");

