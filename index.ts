import dotenv from "dotenv";

dotenv.config();

import connectDB from "./Config/db.js";
import app from "./app.js";
import { seedDefaultPlans } from "./Plans/Services/Plan.services.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await seedDefaultPlans();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port --->>> ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
