import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";
import connectDB from "./Config/db.js";
import app from "./app.js";
import { seedDefaultPlans } from "./Plans/Services/Plan.services.js";
import { connectReminderRedis } from "./Buddy/reminderSchedule/redisClient.js";
import { startSseHealthLogger } from "./Buddy/Services/sseDiagnostics.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await seedDefaultPlans();
    await connectReminderRedis();
    startSseHealthLogger();
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
