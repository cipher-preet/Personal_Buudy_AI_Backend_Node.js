import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { sessionConfig } from "./Config/session";
import dns from "dns";

import morgan from "morgan";
import authRoutes from "./Authentication/Routes";

// Set the DNS server to use for resolving hostnames
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
app.use(morgan("dev"));

app.set("trust proxy", 1);
app.use(
  cors({
    origin: ["*"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.options(/.*/, cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionConfig);

app.use(cookieParser());

app.use("/api/v1/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.get("/health", (req, res) => {
  res.send({ version: "0.0.1", status: "ok", date: "25-12-2025" });
});

export default app;
