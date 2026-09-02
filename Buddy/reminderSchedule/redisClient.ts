import { Redis } from "ioredis";

import {
  describeReminderRedisUrl,
  formatReminderRedisTarget,
  redactRedisSecrets,
} from "./redisTarget.js";

let client: Redis | null = null;
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

  if (!client) {
    let targetLabel = "host=unknown port=unknown tls=false";
    try {
      targetLabel = formatReminderRedisTarget(describeReminderRedisUrl(url));
    } catch {
      console.log(
        JSON.stringify({
          event: "reminder_redis_config_error",
          message: "REMINDER_REDIS_URL is invalid",
        }),
      );
      return null;
    }
    console.log(`Reminder Redis configured: ${targetLabel}`);
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    client.on("error", (error: Error) => {
      console.log(
        JSON.stringify({
          event: "reminder_redis_error",
          message: redactRedisSecrets(error.message),
        }),
      );
    });
  }

  return client;
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
