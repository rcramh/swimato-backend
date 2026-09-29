import { describe, expect, it } from "vitest";
import { API, adminClient, newClient, signUp } from "./helpers.js";

interface UserRow {
  id: string;
  email: string;
  passwordHash?: string;
}

describe("admin: list users", () => {
  it("is forbidden for plain users", async () => {
    const { agent } = newClient();
    await signUp(agent);

    const res = await agent.get(`${API}/admin/users`).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("requires sign-in", async () => {
    await newClient().agent.get(`${API}/admin/users`).expect(401);
  });

  it("pages through every user exactly once with the cursor", async () => {
    const { agent } = await adminClient();
    for (let i = 0; i < 5; i += 1) await signUp(newClient().agent);

    const seen: UserRow[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await agent
        .get(`${API}/admin/users`)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      const data = res.body.data as {
        users: UserRow[];
        nextCursor: string | null;
      };
      expect(data.users.length).toBeLessThanOrEqual(2);
      seen.push(...data.users);
      cursor = data.nextCursor;
      pages += 1;
    } while (cursor && pages < 100);

    expect(new Set(seen.map((u) => u.id)).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(6);
    expect(seen.every((u) => u.passwordHash === undefined)).toBe(true);
  });

  it("validates limit and cursor", async () => {
    const { agent } = await adminClient();

    await agent.get(`${API}/admin/users`).query({ limit: 0 }).expect(400);
    await agent.get(`${API}/admin/users`).query({ limit: 101 }).expect(400);
    await agent.get(`${API}/admin/users`).query({ limit: "abc" }).expect(400);
    const bad = await agent
      .get(`${API}/admin/users`)
      .query({ cursor: "not-a-cursor" })
      .expect(400);
    expect(bad.body.error.details[0].field).toBe("cursor");
  });
});
