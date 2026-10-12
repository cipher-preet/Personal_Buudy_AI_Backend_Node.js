import {
  describeReminderRedisUrl,
  formatReminderRedisTarget,
  redactRedisSecrets,
} from "./redisTarget.js";
import { getSharedRedis, reclaimStaleRedisClients } from "./sharedRedis.js";

let missingUrlLogged = false;

export const getReminderRedisUrl = () =>
  process.env.REMINDER_REDIS_URL?.trim() || "";

export const getReminderRedis = () => {
  const url = getReminderRedisUrl();
  if (!url) {
    if (!missingUrlLogged) {
      missingUrlLogged = true;
      console.log(
        JSON.stringify({
          event: "reminder_redis_config_error",
          message: "REMINDER_REDIS_URL is not configured",
        }),
      );
    }
    return null;
  }

  try {
    const targetLabel = formatReminderRedisTarget(describeReminderRedisUrl(url));
    console.log(`Reminder Redis configured: ${targetLabel}`);
  } catch {
    console.log(
      JSON.stringify({
        event: "reminder_redis_config_error",
        message: "REMINDER_REDIS_URL is invalid",
      }),
    );
    return null;
  }
  return getSharedRedis(url, "reminder");
};

export const connectReminderRedis = async () => {
  const redis = getReminderRedis();
  if (!redis) {
    return null;
  }

  const url = getReminderRedisUrl();
  const target = describeReminderRedisUrl(url);

  if (redis.status === "wait") {
    try {
      await redis.connect();
    } catch (error: any) {
      console.log(
        JSON.stringify({
          event: "reminder_redis_connect_failed",
          message: redactRedisSecrets(
          error?.message || "Unable to connect to reminder Redis",
        ),
        }),
      );
      return null;
    }
  }

  try {
    await redis.ping();
    await reclaimStaleRedisClients(redis);
    console.log(
      `Reminder Redis connected: host=${target.host} port=${target.port}`,
    );
  } catch (error: any) {
    console.log(
      JSON.stringify({
        event: "reminder_redis_connect_failed",
        message: redactRedisSecrets(
          error?.message || "Unable to ping reminder Redis",
        ),
      }),
    );
    return null;
  }

  return redis;
};
