import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Response } from "supertest";
import { createApp } from "../src/app.js";
import { API_PREFIX } from "../src/constants/http.js";
import { seedAdmin } from "../src/services/auth.service.js";

export const API = API_PREFIX;
export const TRUSTED_ORIGIN = "http://localhost:3000";
export const PASSWORD = "Secret123";

// Repositories are process-wide, so every test uses its own email.
export const uniqueEmail = (label = "user") =>
  `${label}-${randomUUID()}@example.com`;

/** A fresh app (fresh rate-limit counters) and a cookie-keeping client. */
export function newClient() {
  const app = createApp();
  return { app, agent: request.agent(app) };
}

export async function signUp(
  agent: ReturnType<typeof request.agent>,
  email = uniqueEmail(),
  password = PASSWORD,
) {
  const res = await agent
    .post(`${API}/auth/signup`)
    .send({ name: "Test User", email, password });
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { email, password, res };
}

export async function adminClient() {
  const client = newClient();
  const email = uniqueEmail("admin");
  await seedAdmin(email, "AdminPass1");
  await client.agent
    .post(`${API}/auth/login`)
    .send({ email, password: "AdminPass1" })
    .expect(200);
  return client;
}

const setCookieHeaders = (res: Response): string[] => {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
};

/** The raw Set-Cookie line for one cookie, or undefined. */
export const setCookie = (res: Response, name: string) =>
  setCookieHeaders(res).find((line) => line.startsWith(`${name}=`));

/** Just the value of a cookie set by this response ("" when cleared). */
export function cookieValue(res: Response, name: string): string | undefined {
  const line = setCookie(res, name);
  return line?.slice(name.length + 1).split(";")[0];
}
