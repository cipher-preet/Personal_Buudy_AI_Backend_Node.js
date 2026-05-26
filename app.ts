import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import dns from "dns";

import morgan from "morgan";

// Set the DNS server to use for resolving hostnames
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
app.use(morgan("dev"));

app.set("trust proxy", 1);
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "https://7862b8962a32.ngrok-free.app",
      "https://www.ambemart.com",
      "www.ambemart.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.options(/.*/, cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("server is running");
});

app.get("/health", (req, res) => {
  res.send({ version: "0.0.1", status: "ok", date: "25-12-2025" });
});

export default app;
