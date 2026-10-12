import { randomUUID } from "crypto";

import { redactRedisSecrets } from "../Buddy/reminderSchedule/redisTarget.js";
import { getSharedRedis } from "../Buddy/reminderSchedule/sharedRedis.js";

const interactiveStream = () =>
  process.env.REDIS_GOAL_INTERACTIVE_STREAM?.trim() || "buddy:goals:interactive";

const jobsStream = () => process.env.REDIS_GOAL_JOBS_STREAM?.trim() || "buddy:goals:jobs";

/** Dedicated Achieve Goal Redis only. Do not fall back to conversation / reminder Redis. */
export const getGoalRedisUrl = () => process.env.GOAL_REDIS_URL?.trim() || "";

const getClient = () => {
  const url = getGoalRedisUrl();
  if (!url) return null;
  return getSharedRedis(url, "goals");
};

const ensureConnected = async () => {
  const redis = getClient();
  if (!redis) return null;
  if (redis.status === "wait") {
    try {
      await redis.connect();
    } catch (error) {
      console.log(
        JSON.stringify({
          event: "goal_redis_connect_failed",
          message: redactRedisSecrets(error instanceof Error ? error.message : "connect failed"),
        }),
      );
      return null;
    }
  }
  return redis;
};

export const publishGoalJob = async ({
  jobId,
  jobType,
  goalId,
  userId,
  payload = {},
}: {
  jobId: string;
  jobType: "clarify" | "baseline" | "plan" | "evidence" | "review" | "research";
  goalId: string;
  userId: string;
  payload?: Record<string, unknown>;
}) => {
  const redis = await ensureConnected();
  if (!redis) {
    throw new Error("GOAL_REDIS_URL is not configured for goal jobs.");
  }

  const stream = jobType === "clarify" ? interactiveStream() : jobsStream();
  const envelope = {
    eventId: jobId || randomUUID(),
    eventType: `goal.${jobType}`,
    eventVersion: 1,
    correlationId: goalId,
    causationId: null,
    userId,
    spaceId: "",
    conversationId: goalId,
    payload: { goalId, jobId, jobType, ...payload },
    attempt: 0,
    createdAt: new Date().toISOString(),
  };

  await redis.xadd(stream, "MAXLEN", "~", "200", "*", "event", JSON.stringify(envelope));
};
