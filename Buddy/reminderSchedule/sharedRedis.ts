import { Redis } from "ioredis";

import { redactRedisSecrets } from "./redisTarget.js";

const clients = new Map<string, Redis>();

const normalizeUrl = (url: string) => url.trim().replace(/\/$/, "");

const clientName = () => `buddy-node-${process.pid}`;

/**
 * One ioredis client per Redis URL in this process.
 * Goals, reminders, and meetings often share the same Redis Cloud DB;
 * separate clients burn the Essentials connection quota.
 */
export const getSharedRedis = (url: string, label = "redis") => {
  const key = normalizeUrl(url);
  if (!key) return null;
  const existing = clients.get(key);
  if (existing) return existing;

  const name = clientName();
  const client = new Redis(key, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 8000,
    enableOfflineQueue: true,
    // Keep a single TCP socket for this process.
    connectionName: name,
  });
  client.on("error", (error: Error) => {
    console.log(
      JSON.stringify({
        event: "shared_redis_error",
        label,
        message: redactRedisSecrets(error.message),
      }),
    );
  });
  clients.set(key, client);
  console.log(JSON.stringify({ event: "shared_redis_ready", label, shared: true, clientName: name }));
  return client;
};

export const reclaimStaleRedisClients = async (client: Redis, idleSeconds = 90) => {
  try {
    const listing = await client.client("LIST");
    const text = typeof listing === "string" ? listing : String(listing || "");
    const myPid = String(process.pid);
    let killed = 0;
    for (const line of text.split("\n")) {
      const fields = Object.fromEntries(
        line
          .split(" ")
          .filter((part) => part.includes("="))
          .map((part) => {
            const index = part.indexOf("=");
            return [part.slice(0, index), part.slice(index + 1)];
          }),
      ) as Record<string, string>;
      const name = fields.name || "";
      if (!name.startsWith("buddy-node-") && !name.startsWith("buddy-orch-")) continue;
      if (name.includes(myPid)) continue;
      const idle = Number(fields.idle || 0);
      // Never kill a live orchestration worker from Node; only idle orphans.
      if (name.startsWith("buddy-orch-") && idle < idleSeconds) continue;
      if (name.startsWith("buddy-node-") && idle < idleSeconds) continue;
      if (!fields.id) continue;
      try {
        await client.client("KILL", "ID", fields.id);
        killed += 1;
      } catch {
        // ignore
      }
    }
    if (killed > 0) {
      console.log(JSON.stringify({ event: "shared_redis_reclaimed", killed }));
    }
    return killed;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "shared_redis_reclaim_skipped",
        message: redactRedisSecrets(error instanceof Error ? error.message : "reclaim failed"),
      }),
    );
    return 0;
  }
};

export const urlsMatch = (left?: string, right?: string) =>
  Boolean(left && right && normalizeUrl(left) === normalizeUrl(right));
