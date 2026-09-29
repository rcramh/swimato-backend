import mongoose from "mongoose";
import { env } from "../config/env.js";
import { moduleLogger } from "../logger/logger.js";

/* ---------------------------------------------------------------
   MongoDB

   Optional: skipped entirely when MONGO_URI is empty. When it is set,
   the first connect fails fast — an unreachable cluster at boot is
   almost always a bad URI or an unlisted IP, and crashing surfaces
   that immediately. Drops after boot are usually transient and the
   driver reconnects on its own.
----------------------------------------------------------------*/

const log = moduleLogger("mongo");

const CONNECT_TIMEOUT_MS = 10_000;

export type MongoStatus =
  | "disabled"
  | "disconnected"
  | "connected"
  | "connecting"
  | "disconnecting"
  | "unknown";

const READY_STATES: readonly MongoStatus[] = [
  "disconnected",
  "connected",
  "connecting",
  "disconnecting",
];

export const isMongoEnabled = () => Boolean(env.MONGO_URI);

export async function connectMongo(): Promise<void> {
  if (!env.MONGO_URI) {
    log.warn("MONGO_URI not set, skipping MongoDB");
    return;
  }

  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () => {
    log.warn("disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    log.info("reconnected");
  });
  mongoose.connection.on("error", (error: Error) => {
    log.error({ err: error }, "connection error");
  });

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
  });

  log.info({ database: mongoose.connection.name }, "connected");
}

export async function disconnectMongo(): Promise<void> {
  if (!isMongoEnabled()) return;
  await mongoose.connection.close();
}

export const mongoStatus = (): MongoStatus =>
  isMongoEnabled()
    ? (READY_STATES[mongoose.connection.readyState] ?? "unknown")
    : "disabled";
