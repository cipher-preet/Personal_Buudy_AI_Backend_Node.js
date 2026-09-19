import { createHmac } from "crypto";

import { Redis } from "ioredis";

import { redactRedisSecrets } from "../Buddy/reminderSchedule/redisTarget.js";
import { getMeetingConfig } from "./config.js";
import { logMeetingEvent } from "./log.js";

let client: Redis | null = null;

const getMeetingRedis = () => {
  const url = getMeetingConfig().redisUrl;
  if (!url) {
    return null;
  }
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    client.on("error", (error: Error) => {
      logMeetingEvent("meeting_redis_error", {
        message: redactRedisSecrets(error.message),
      });
    });
  }
  return client;
};

const ensureConnected = async () => {
  const redis = getMeetingRedis();
  if (!redis) {
    return null;
  }
  if (redis.status === "wait") {
    await redis.connect();
  }
  return redis;
};

export type MeetingEventEnvelope = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  correlationId: string;
  causationId?: string | null;
  userId: string;
  spaceId: string;
  conversationId: string;
  payload: Record<string, unknown>;
  attempt: number;
  createdAt: string;
};

export const publishMeetingEvent = async (
  stream: string,
  envelope: MeetingEventEnvelope,
) => {
  const config = getMeetingConfig();
  if (config.queueApiBaseUrl && config.queueApiServiceToken) {
    const body = JSON.stringify({ ...envelope, targetStream: stream });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.queueApiServiceToken}`,
    };
    if (config.queueApiHmacSecret) {
      headers["x-buddy-timestamp"] = timestamp;
      headers["x-buddy-signature"] = `sha256=${createHmac("sha256", config.queueApiHmacSecret)
        .update(`${timestamp}.${body}`)
        .digest("hex")}`;
    }
    const response = await fetch(`${config.queueApiBaseUrl}/internal/events`, {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      throw new Error(`Queue API rejected event (${response.status})`);
    }
    return envelope.eventId;
  }

  const redis = await ensureConnected();
  if (!redis) {
    throw new Error("REDIS_URL is not configured for meeting extension jobs");
  }
  await redis.xadd(stream, "*", "event", JSON.stringify(envelope));
  return envelope.eventId;
};

export const buildEnvelope = ({
  eventId,
  eventType,
  userId,
  spaceId,
  conversationId,
  payload,
}: {
  eventId: string;
  eventType: string;
  userId: string;
  spaceId: string;
  conversationId: string;
  payload: Record<string, unknown>;
}): MeetingEventEnvelope => ({
  eventId,
  eventType,
  eventVersion: 1,
  correlationId: conversationId,
  causationId: null,
  userId,
  spaceId,
  conversationId,
  payload,
  attempt: 0,
  createdAt: new Date().toISOString(),
});

export const __resetMeetingRedisForTests = () => {
  client = null;
};
