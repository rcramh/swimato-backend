import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/config/cookies.js";
import { ROTATION_GRACE_MS } from "../src/services/auth.service.js";
import {
  API,
  PASSWORD,
  TRUSTED_ORIGIN,
  cookieValue,
  newClient,
  setCookie,
  signUp,
  uniqueEmail,
} from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signup", () => {
  it("creates the user, signs them in and sets both cookies httpOnly", async () => {
    const { agent } = newClient();
    const email = uniqueEmail();

    const res = await agent
      .post(`${API}/auth/signup`)
      .send({
        name: "  Rahul  ",
        email: `  ${email.toUpperCase()} `,
        password: PASSWORD,
      })
      .expect(201);

    expect(res.body).toEqual({
      success: true,
      data: {
        user: {
          id: expect.any(String),
          name: "Rahul",
          email,
          role: "user",
          createdAt: expect.any(String),
        },
      },
    });
    // tokens only ever travel as cookies
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);

    const access = setCookie(res, ACCESS_COOKIE);
    const refresh = setCookie(res, REFRESH_COOKIE);
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(access).toMatch(/Path=\//);
    expect(access).toMatch(/Max-Age=900/);
    expect(refresh).toMatch(/HttpOnly/);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(refresh).toMatch(/Max-Age=604800/);
  });

  it("rejects invalid input with every failing field and a request id", async () => {
    const { agent } = newClient();

    const res = await agent
      .post(`${API}/auth/signup`)
      .send({ name: "R", email: "not-an-email", password: "weak" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(
      res.body.error.details.map((d: { field: string }) => d.field),
    ).toEqual(expect.arrayContaining(["name", "email", "password"]));
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("refuses extra fields, so a client cannot make itself admin", async () => {
    const { agent } = newClient();

    const res = await agent
      .post(`${API}/auth/signup`)
      .send({
        name: "Mallory",
        email: uniqueEmail(),
        password: PASSWORD,
        role: "admin",
      })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("refuses passwords longer than bcrypt can hash", async () => {
    const { agent } = newClient();
    const tooLong = `Aa1${"😀".repeat(18)}`; // 3 + 72 bytes

    const res = await agent
      .post(`${API}/auth/signup`)
      .send({ name: "Long", email: uniqueEmail(), password: tooLong })
      .expect(400);

    expect(res.body.error.details[0].field).toBe("password");
  });

  it("answers 409 EMAIL_TAKEN for a registered email, in any case", async () => {
    const { agent } = newClient();
    const { email } = await signUp(agent);

    const res = await request(newClient().app)
      .post(`${API}/auth/signup`)
      .send({ name: "Again", email: email.toUpperCase(), password: PASSWORD })
      .expect(409);

    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });
});

describe("login", () => {
  it("signs in with the right password", async () => {
    const { email } = await signUp(newClient().agent);
    const { agent } = newClient();

    const res = await agent
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    expect(res.body.data.user.email).toBe(email);
    expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();
    await agent.get(`${API}/auth/me`).expect(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const { email } = await signUp(newClient().agent);
    const { app } = newClient();

    const wrongPassword = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "Wrong1234" })
      .expect(401);
    const unknownEmail = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: uniqueEmail(), password: "Wrong1234" })
      .expect(401);

    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(setCookie(wrongPassword, ACCESS_COOKIE)).toBeUndefined();
  });

  it("rate-limits repeated failures", async () => {
    const { app } = newClient();
    const attempt = () =>
      request(app)
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail(), password: "Wrong1234" });

    for (let i = 0; i < 10; i += 1) await attempt().expect(401);
    const res = await attempt().expect(429);

    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("authenticated requests", () => {
  it("401s without a cookie", async () => {
    const res = await request(newClient().app)
      .get(`${API}/auth/me`)
      .expect(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects a token signed with alg none", async () => {
    const { agent } = newClient();
    const { res } = await signUp(agent);
    const payload = jwt.decode(cookieValue(res, ACCESS_COOKIE) ?? "");
    const forged = jwt.sign(payload as object, "", { algorithm: "none" });

    await request(newClient().app)
      .get(`${API}/auth/me`)
      .set("Cookie", `${ACCESS_COOKIE}=${forged}`)
      .expect(401);
  });

  it("rejects a tampered token", async () => {
    const { agent } = newClient();
    const { res } = await signUp(agent);

    await request(newClient().app)
      .get(`${API}/auth/me`)
      .set(
        "Cookie",
        `${ACCESS_COOKIE}=${cookieValue(res, ACCESS_COOKIE) ?? ""}x`,
      )
      .expect(401);
  });
});

describe("refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const { agent } = newClient();
    const { res: signupRes } = await signUp(agent);

    const res = await agent.post(`${API}/auth/refresh`).expect(200);

    expect(res.body.data.user.role).toBe("user");
    expect(cookieValue(res, REFRESH_COOKIE)).toBeTruthy();
    expect(cookieValue(res, REFRESH_COOKIE)).not.toBe(
      cookieValue(signupRes, REFRESH_COOKIE),
    );
  });

  it("tolerates two tabs refreshing with the same token", async () => {
    const { agent } = newClient();
    const { res: signupRes } = await signUp(agent);
    const original = cookieValue(signupRes, REFRESH_COOKIE) ?? "";

    await agent.post(`${API}/auth/refresh`).expect(200);
    const secondTab = await request(newClient().app)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `${REFRESH_COOKIE}=${original}`)
      .expect(200);

    // new access token, but the newer refresh cookie is left alone
    expect(cookieValue(secondTab, ACCESS_COOKIE)).toBeTruthy();
    expect(setCookie(secondTab, REFRESH_COOKIE)).toBeUndefined();
    await agent.get(`${API}/auth/me`).expect(200);
  });

  it("revokes the whole session when an old token is replayed later", async () => {
    const { agent } = newClient();
    const { res: signupRes } = await signUp(agent);
    const stolen = cookieValue(signupRes, REFRESH_COOKIE) ?? "";

    await agent.post(`${API}/auth/refresh`).expect(200);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + ROTATION_GRACE_MS + 1_000);

    const replay = await request(newClient().app)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `${REFRESH_COOKIE}=${stolen}`)
      .expect(401);
    expect(replay.body.error.code).toBe("SESSION_REVOKED");

    // the legitimate holder is signed out too
    await agent.post(`${API}/auth/refresh`).expect(401);
    await agent.get(`${API}/auth/me`).expect(401);
  });

  it("clears cookies when the refresh token is invalid", async () => {
    const res = await request(newClient().app)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `${REFRESH_COOKIE}=garbage`)
      .expect(401);

    expect(cookieValue(res, REFRESH_COOKIE)).toBe("");
    expect(cookieValue(res, ACCESS_COOKIE)).toBe("");
  });
});

describe("logout", () => {
  it("ends the session immediately, not when the access token expires", async () => {
    const { agent } = newClient();
    const { res: signupRes } = await signUp(agent);
    const access = cookieValue(signupRes, ACCESS_COOKIE) ?? "";

    await agent.post(`${API}/auth/logout`).expect(204);

    const res = await request(newClient().app)
      .get(`${API}/auth/me`)
      .set("Cookie", `${ACCESS_COOKIE}=${access}`)
      .expect(401);
    expect(res.body.error.code).toBe("SESSION_REVOKED");
    await agent.post(`${API}/auth/refresh`).expect(401);
  });

  it("succeeds even without cookies", async () => {
    await request(newClient().app).post(`${API}/auth/logout`).expect(204);
  });

  it("logout-all ends every device", async () => {
    const { email } = await signUp(newClient().agent);
    const phone = newClient().agent;
    const laptop = newClient().agent;
    await phone.post(`${API}/auth/login`).send({ email, password: PASSWORD });
    await laptop.post(`${API}/auth/login`).send({ email, password: PASSWORD });

    await laptop.post(`${API}/auth/logout-all`).expect(204);

    await phone.get(`${API}/auth/me`).expect(401);
    await phone.post(`${API}/auth/refresh`).expect(401);
  });
});

describe("change password", () => {
  const NEW_PASSWORD = "Fresh4567";

  it("changes it, keeps this device and signs out every other one", async () => {
    const { email } = await signUp(newClient().agent);
    const current = newClient().agent;
    const other = newClient().agent;
    await current.post(`${API}/auth/login`).send({ email, password: PASSWORD });
    await other.post(`${API}/auth/login`).send({ email, password: PASSWORD });

    await current
      .patch(`${API}/auth/password`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await current.get(`${API}/auth/me`).expect(200);
    await other.get(`${API}/auth/me`).expect(401);

    const fresh = newClient().app;
    await request(fresh)
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(401);
    await request(fresh)
      .post(`${API}/auth/login`)
      .send({ email, password: NEW_PASSWORD })
      .expect(200);
  });

  it("requires the correct current password", async () => {
    const { agent } = newClient();
    await signUp(agent);

    const res = await agent
      .patch(`${API}/auth/password`)
      .send({ currentPassword: "Wrong1234", newPassword: NEW_PASSWORD })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects reusing the same password", async () => {
    const { agent } = newClient();
    await signUp(agent);

    await agent
      .patch(`${API}/auth/password`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(400);
  });
});

describe("CSRF origin check", () => {
  it("refuses a state-changing request from a foreign origin", async () => {
    const res = await request(newClient().app)
      .post(`${API}/auth/logout`)
      .set("Origin", "https://evil.example")
      .expect(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("allows the configured origin", async () => {
    await request(newClient().app)
      .post(`${API}/auth/logout`)
      .set("Origin", TRUSTED_ORIGIN)
      .expect(204);
  });

  // The CRA dev proxy rewrites Origin to its target, i.e. this API.
  it("allows a same-origin request, as sent through the dev proxy", async () => {
    await request(newClient().app)
      .post(`${API}/auth/logout`)
      .set("Host", "localhost:5050")
      .set("Origin", "http://localhost:5050")
      .expect(204);
  });

  it("does not trust a look-alike of its own origin", async () => {
    await request(newClient().app)
      .post(`${API}/auth/logout`)
      .set("Host", "localhost:5050")
      .set("Origin", "http://localhost:5050.evil.example")
      .expect(403);
  });
});
