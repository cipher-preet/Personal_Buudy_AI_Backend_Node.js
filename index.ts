import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";
import connectDB from "./Config/db.js";
import app from "./app.js";
import { seedDefaultPlans } from "./Plans/Services/Plan.services.js";
import { seedDefaultDocumentTemplates } from "./DocumentTemplates/Services/DocumentTemplate.services.js";
import { connectReminderRedis } from "./Buddy/reminderSchedule/redisClient.js";
import { startSseHealthLogger } from "./Buddy/Services/sseDiagnostics.js";
import { isMeetingExtensionEnabled } from "./MeetingExtension/config.js";
import { startMeetingStaleScanner } from "./MeetingExtension/staleScanner.js";
import { startGoogleCalendarSyncScheduler } from "./Buddy/Services/GoogleCalendar.services.js";

const PORT = Number(process.env.PORT) || 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientMongoError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|PoolCleared|MongoNetworkError|MongoServerSelectionError/i.test(
    message,
  );
};

/** Seed catalogs with a short retry — remote Mongo often resets right after connect. */
const runWithMongoRetry = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt >= attempts) {
        throw error;
      }
      console.warn(
        JSON.stringify({
          event: "startup_step_retry",
          step: label,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
};

const startServer = async () => {
  try {
    await connectDB();
    await runWithMongoRetry("seedDefaultPlans", () => seedDefaultPlans());
    await runWithMongoRetry("seedDefaultDocumentTemplates", () =>
      seedDefaultDocumentTemplates(),
    );
    await connectReminderRedis();
    startSseHealthLogger();
    if (isMeetingExtensionEnabled()) {
      startMeetingStaleScanner();
    }
    startGoogleCalendarSyncScheduler();
    const { startGoalOutboxPublisher } = await import("./Goals/outbox.js");
    startGoalOutboxPublisher();
    setInterval(() => {
      console.log(
        JSON.stringify({
          event: "mongo_connection_health",
          mongoose_ready_state: mongoose.connection.readyState,
        }),
      );
    }, 60_000).unref();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port --->>> ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
