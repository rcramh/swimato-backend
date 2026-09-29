import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { allowedOrigins, env, isProduction } from "./config/env.js";
import {
  API_PREFIX,
  JSON_BODY_LIMIT,
  REQUEST_ID_HEADER,
} from "./constants/http.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { requestContext, requestLogger } from "./middlewares/requestLogger.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createApiRouter } from "./routes/index.js";

/* ---------------------------------------------------------------
   Express application

   A factory rather than a module-level singleton, so tests build a
   fresh app (with fresh rate-limit counters) per suite. The order of
   middleware below is deliberate: ids and logging first so every
   later failure is traceable, error handling last.
----------------------------------------------------------------*/

export function createApp(): Express {
  const app = express();

  // Render, Railway and friends terminate TLS at one proxy hop; without
  // this, req.secure is false and Secure cookies are refused. In
  // development the CRA proxy on localhost adds X-Forwarded-For.
  app.set("trust proxy", isProduction ? 1 : "loopback");
  app.disable("x-powered-by");

  app.use(requestContext);
  app.use(requestLogger);
  app.use(helmet());

  // Credentialed CORS cannot use "*": the browser rejects it. The
  // allowlist is explicit; the dev proxy setup is same-origin and
  // never reaches this at all.
  app.use(
    cors({
      origin: [...allowedOrigins],
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    }),
  );

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use(createHealthRouter());

  if (env.API_DOCS_ENABLED) {
    app.get(`${API_PREFIX}/docs/openapi.json`, (_req, res) => {
      res.json(openApiDocument);
    });
    app.use(
      `${API_PREFIX}/docs`,
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument),
    );
  }

  app.use(API_PREFIX, createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
