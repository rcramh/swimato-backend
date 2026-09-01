import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import { env, isProduction } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Render, Railway and friends terminate TLS at a proxy. Without this,
// req.secure is false and Express refuses to set Secure cookies.
if (isProduction) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet());

/* CORS with credentials cannot use a wildcard origin — the browser
   rejects `Access-Control-Allow-Origin: *` on credentialed requests.
   The allowlist is explicit for that reason. In the dev proxy setup
   requests are same-origin and never reach this at all. */
app.use(
  cors({
    origin: env.CLIENT_ORIGIN.split(",").map((value) => value.trim()),
    credentials: true,
  }),
);

app.use(morgan(isProduction ? "combined" : "dev"));

// A JSON auth payload is a few hundred bytes; the default 100kb limit
// is a needlessly large thing to hand an unauthenticated caller.
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api", healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
