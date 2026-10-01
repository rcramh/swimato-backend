import type { Request, Response } from "express";
import { mongoStatus } from "../database/mongo.js";
import { moduleLogger } from "../logger/logger.js";
import {
  menuRepository,
  sessionRepository,
  userRepository,
} from "../repositories/index.js";

/* ---------------------------------------------------------------
   Health probes

   /health (liveness)  — is the process able to answer at all? No
                         dependency checks: a database outage must not
                         make the orchestrator restart healthy pods.

   /ready  (readiness) — should traffic be routed here? Checks every
                         dependency a request needs, each with a short
                         timeout so a hung database cannot hang the
                         probe. Reports up/down per dependency only —
                         no versions, hosts or error text.
----------------------------------------------------------------*/

const log = moduleLogger("health");

const PROBE_TIMEOUT_MS = 2_000;

type CheckResult = "up" | "down" | "disabled";

async function probe(
  name: string,
  check: () => Promise<void>,
): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${name} probe timed out`));
    }, PROBE_TIMEOUT_MS);
  });

  try {
    await Promise.race([check(), timeout]);
    return "up";
  } catch (error) {
    log.warn({ err: error, dependency: name }, "readiness check failed");
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

function mongoCheck(): CheckResult {
  const status = mongoStatus();
  if (status === "disabled") return "disabled";
  return status === "connected" ? "up" : "down";
}

export function liveness(_req: Request, res: Response) {
  res.json({ status: "ok" });
}

export async function readiness(_req: Request, res: Response) {
  const [users, sessions, menus] = await Promise.all([
    probe("users", () => userRepository.ping()),
    probe("sessions", () => sessionRepository.ping()),
    probe("menus", () => menuRepository.ping()),
  ]);
  const checks = { users, sessions, menus, mongo: mongoCheck() };

  const ready = Object.values(checks).every((result) => result !== "down");
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
  });
}
