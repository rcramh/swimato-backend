import mongoose from "mongoose";
import { env } from "./env.js";

/* ---------------------------------------------------------------
   Database

   Fail fast on the first connect: an unreachable Mongo at boot is
   almost always a bad URI or an unlisted IP, and crashing surfaces
   that immediately. Drops *after* boot are different — those are
   usually transient, and the driver reconnects on its own.
----------------------------------------------------------------*/

export async function connectDb() {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () =>
    console.warn("[db] disconnected"),
  );
  mongoose.connection.on("reconnected", () => console.log("[db] reconnected"));
  mongoose.connection.on("error", (error) =>
    console.error("[db] error:", error.message),
  );

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  console.log(`[db] connected to ${mongoose.connection.name}`);
}

export async function disconnectDb() {
  await mongoose.connection.close();
}

const READY_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

export const dbStatus = () =>
  READY_STATES[mongoose.connection.readyState] ?? "unknown";
