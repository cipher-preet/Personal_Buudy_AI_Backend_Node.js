type SseWindow = {
  polls: number;
  slowPolls: number;
  maxDurationMs: number;
};

let activeConnections = 0;
let windowStats: SseWindow = { polls: 0, slowPolls: 0, maxDurationMs: 0 };
let healthTimer: ReturnType<typeof setInterval> | null = null;

const logEvent = (event: string, fields: Record<string, unknown>) => {
  console.log(JSON.stringify({ event, ...fields }));
};

export const recordSseOpen = () => {
  activeConnections += 1;
};

export const recordSseClose = () => {
  activeConnections = Math.max(0, activeConnections - 1);
};

export const recordSsePoll = (durationMs: number) => {
  windowStats.polls += 1;
  windowStats.maxDurationMs = Math.max(windowStats.maxDurationMs, durationMs);
  if (durationMs > 500) {
    windowStats.slowPolls += 1;
    logEvent("sse_slow_poll", {
      duration_ms: durationMs,
      active_connections: activeConnections,
    });
  }
  if (durationMs > 250) {
    logEvent("mongo_query_timing", {
      operation: "sse_status_poll",
      duration_ms: durationMs,
    });
  }
};

export const emitSseHealth = () => {
  logEvent("sse_health", {
    active_connections: activeConnections,
    polls_last_minute: windowStats.polls,
    slow_polls_last_minute: windowStats.slowPolls,
    max_poll_duration_ms: windowStats.maxDurationMs,
  });
  windowStats = { polls: 0, slowPolls: 0, maxDurationMs: 0 };
};

export const startSseHealthLogger = (intervalMs = 60_000) => {
  if (healthTimer) {
    return;
  }
  healthTimer = setInterval(emitSseHealth, intervalMs);
  healthTimer.unref?.();
};

export const getSseDiagnostics = () => ({
  activeConnections,
  polls: windowStats.polls,
  slowPolls: windowStats.slowPolls,
  maxDurationMs: windowStats.maxDurationMs,
});

export const resetSseDiagnostics = () => {
  activeConnections = 0;
  windowStats = { polls: 0, slowPolls: 0, maxDurationMs: 0 };
};
