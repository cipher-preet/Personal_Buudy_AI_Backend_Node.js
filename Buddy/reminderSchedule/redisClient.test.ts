import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { getReminderRedisUrl } from "./redisClient.js";
import {
  describeReminderRedisUrl,
  formatReminderRedisTarget,
  redactRedisSecrets,
} from "./redisTarget.js";

const SAMPLE =
  "redis://default:super-secret-password@redis-18535.example.redislabs.com:18535";

describe("describeReminderRedisUrl", () => {
  it("logs host and port without credentials", () => {
    const target = describeReminderRedisUrl(SAMPLE);
    const formatted = formatReminderRedisTarget(target);
    assert.equal(target.host, "redis-18535.example.redislabs.com");
    assert.equal(target.port, "18535");
    assert.equal(target.tls, false);
    assert.equal(
      formatted,
      "host=redis-18535.example.redislabs.com port=18535 tls=false",
    );
    assert.doesNotMatch(formatted, /super-secret-password/);
    assert.doesNotMatch(formatted, /default:/);
    assert.doesNotMatch(JSON.stringify(target), /super-secret-password/);
  });

  it("marks rediss URLs as tls", () => {
    const target = describeReminderRedisUrl(
      "rediss://:hidden@redis.example.com:6380",
    );
    assert.equal(target.tls, true);
    assert.equal(target.port, "6380");
    assert.doesNotMatch(formatReminderRedisTarget(target), /hidden/);
  });

  it("redacts redis URLs from error text", () => {
    const redacted = redactRedisSecrets(
      "connect failed redis://default:super-secret-password@host:18535",
    );
    assert.equal(redacted, "connect failed redis://<redacted>");
    assert.doesNotMatch(redacted, /super-secret-password/);
  });
});

describe("getReminderRedisUrl", () => {
  it("does not fall back to REDIS_URL in source", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./redisClient.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /REMINDER_REDIS_URL/);
    assert.doesNotMatch(source, /process\.env\.REDIS_URL/);
  });

  it("reads REMINDER_REDIS_URL and ignores REDIS_URL", () => {
    const previousReminder = process.env.REMINDER_REDIS_URL;
    const previousSpeech = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://speech-redis:6379";
    process.env.REMINDER_REDIS_URL = "";
    assert.equal(getReminderRedisUrl(), "");
    process.env.REMINDER_REDIS_URL = "redis://reminder-redis:18535";
    assert.equal(getReminderRedisUrl(), "redis://reminder-redis:18535");
    if (previousReminder === undefined) {
      delete process.env.REMINDER_REDIS_URL;
    } else {
      process.env.REMINDER_REDIS_URL = previousReminder;
    }
    if (previousSpeech === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousSpeech;
    }
  });
});
