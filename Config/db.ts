import mongoose from "mongoose";
import type { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.trim();

if (!MONGO_URI) {
  throw new Error("MONGO_URI environment variable is missing");
}

const CONNECT_RETRIES = Math.max(
  1,
  Number.parseInt(process.env.MONGO_CONNECT_RETRIES || "5", 10) || 5,
);
const CONNECT_RETRY_MS = Math.max(
  250,
  Number.parseInt(process.env.MONGO_CONNECT_RETRY_MS || "1500", 10) || 1500,
);

/** Shared options for mongoose + connect-mongo (same remote host/pool behavior). */
export const mongoConnectionOptions = {
  // Self-hosted single IP (e.g. EC2) — avoid SRV / replica-set discovery surprises.
  directConnection: !MONGO_URI.includes("mongodb+srv://") && !MONGO_URI.includes(","),
  maxPoolSize: Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || "10", 10) || 10,
  minPoolSize: Number.parseInt(process.env.MONGO_MIN_POOL_SIZE || "0", 10) || 0,
  serverSelectionTimeoutMS:
    Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "15000", 10) || 15_000,
  connectTimeoutMS:
    Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || "15000", 10) || 15_000,
  socketTimeoutMS:
    Number.parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "45000", 10) || 45_000,
  heartbeatFrequencyMS: 10_000,
  // Prefer IPv4 when dual-stack DNS/route flakiness causes ECONNRESET.
  family: 4 as const,
  retryWrites: true,
  retryReads: true,
};

let resolveClient: ((client: MongoClient) => void) | null = null;
let rejectClient: ((error: Error) => void) | null = null;
let clientReady = false;

/**
 * Session store waits on this until `connectDB()` succeeds — one shared client,
 * instead of opening a second pool while mongoose is still connecting.
 */
export const mongoClientPromise = new Promise<MongoClient>((resolve, reject) => {
  resolveClient = resolve;
  rejectClient = reject;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientMongoError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|PoolCleared|MongoNetworkError|MongoServerSelectionError|topology was destroyed|connection timed out/i.test(
    message,
  );
};

const attachConnectionListeners = () => {
  const { connection } = mongoose;

  connection.on("connected", () => {
    console.log(
      JSON.stringify({
        event: "mongo_connected",
        readyState: connection.readyState,
      }),
    );
  });

  connection.on("reconnected", () => {
    console.log(
      JSON.stringify({
        event: "mongo_reconnected",
        readyState: connection.readyState,
      }),
    );
  });

  connection.on("disconnected", () => {
    console.warn(
      JSON.stringify({
        event: "mongo_disconnected",
        readyState: connection.readyState,
      }),
    );
  });

  // Do not exit the process — remote Mongo often resets idle sockets; mongoose will retry.
  connection.on("error", (error) => {
    console.error(
      JSON.stringify({
        event: "mongo_connection_error",
        message: error instanceof Error ? error.message : String(error),
        readyState: connection.readyState,
      }),
    );
  });
};

let listenersAttached = false;

const connectDB = async () => {
  if (!listenersAttached) {
    attachConnectionListeners();
    listenersAttached = true;
  }

  if (mongoose.connection.readyState === 1) {
    if (!clientReady) {
      clientReady = true;
      resolveClient?.(mongoose.connection.getClient());
    }
    return mongoose.connection;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(MONGO_URI, mongoConnectionOptions);
      console.log("MongoDB Connected succesfully");
      if (!clientReady) {
        clientReady = true;
        resolveClient?.(mongoose.connection.getClient());
      }
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      const transient = isTransientMongoError(error);
      console.error(
        JSON.stringify({
          event: "mongo_connect_attempt_failed",
          attempt,
          retries: CONNECT_RETRIES,
          transient,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      if (!transient || attempt >= CONNECT_RETRIES) {
        break;
      }

      await sleep(CONNECT_RETRY_MS * attempt);
    }
  }

  const failure =
    lastError instanceof Error
      ? lastError
      : new Error(`MongoDB connection failed: ${String(lastError)}`);
  if (!clientReady) {
    rejectClient?.(failure);
  }
  console.error("MongoDB connection Error", failure);
  throw failure;
};

export default connectDB;
