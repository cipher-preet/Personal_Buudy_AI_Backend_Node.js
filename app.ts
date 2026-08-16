import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { sessionConfig } from "./Config/session.js";
import dns from "dns";

import morgan from "morgan";
import authRoutes from "./Authentication/Routes.js";
import homeRoutes from "./Buddy/Routes.js";
import planRoutes from "./Plans/Routes.js";
import paymentRoutes from "./Payments/Routes.js";
import adminRoutes from "./Admin/Routes.js";
import { razorpayWebhookController } from "./Payments/Controllers/Payment.Controller.js";

// Set the DNS server to use for resolving hostnames
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
app.use(morgan("dev"));

app.set("trust proxy", 1);
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-admin-key",
    ],
  }),
);

app.options(/.*/, cors());

app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhookController,
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(sessionConfig);

app.use(cookieParser());

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/home", homeRoutes);
app.use("/api/v1/plans", planRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.get("/health", (req, res) => {
  res.send({ version: "0.0.1", status: "okies", date: "25-12-2020" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error", err);

  const isConfigError = /configured|secret/i.test(err.message);
  const isSmsError = /BlackSMS|SMS service/i.test(err.message);
  const message =
    isConfigError || isSmsError
      ? err.message
      : "Something went wrong. Please try again.";

  res.status(500).json({
    success: false,
    message,
  });
});

export default app;
