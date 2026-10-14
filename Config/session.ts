import session from "express-session";
import MongoStore from "connect-mongo";
import { v4 as genuuidv4 } from "uuid";

import { mongoClientPromise, mongoConnectionOptions } from "./db.js";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error("MONGO_URI environment variable is missing");
}

export const sessionConfig = session({
  genid: () => genuuidv4(),
  name: "b2b.sid",
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    // Wait for mongoose.connect so we reuse one client instead of racing a second pool.
    clientPromise: mongoClientPromise,
    collectionName: "sessions",
    ttl: THIRTY_DAYS_SECONDS,
    // Fallback options if the store opens drivers internally.
    mongoOptions: mongoConnectionOptions as Record<string, unknown>,
  }),

  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: "none",
    maxAge: THIRTY_DAYS_MS,
  },
});
