import assert from "node:assert/strict";
import test from "node:test";
import {
  emitSseHealth,
  getSseDiagnostics,
  recordSseClose,
  recordSseOpen,
  recordSsePoll,
  resetSseDiagnostics,
} from "./sseDiagnostics.js";

test("SSE active connection counter increments and decrements", () => {
  resetSseDiagnostics();
  recordSseOpen();
  recordSseOpen();
  assert.equal(getSseDiagnostics().activeConnections, 2);
  recordSseClose();
  assert.equal(getSseDiagnostics().activeConnections, 1);
  recordSseClose();
  recordSseClose();
  assert.equal(getSseDiagnostics().activeConnections, 0);
});

test("SSE health summary counts polls and only slow polls above 500ms", () => {
  resetSseDiagnostics();
  const logs: string[] = [];
  const original = console.log;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
  try {
    recordSsePoll(40);
    recordSsePoll(300);
    recordSsePoll(800);
    emitSseHealth();
  } finally {
    console.log = original;
  }
  const events = logs.map(line => JSON.parse(line));
  assert.equal(events.filter(item => item.event === "sse_slow_poll").length, 1);
  assert.equal(events.filter(item => item.event === "mongo_query_timing").length, 2);
  const health = events.find(item => item.event === "sse_health");
  assert.equal(health.active_connections, 0);
  assert.equal(health.polls_last_minute, 3);
  assert.equal(health.slow_polls_last_minute, 1);
  assert.equal(health.max_poll_duration_ms, 800);
  assert.equal(
    JSON.stringify(events).includes("rawText"),
    false,
  );
});
