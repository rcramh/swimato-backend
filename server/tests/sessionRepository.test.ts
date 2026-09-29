import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemorySessionRepository } from "../src/repositories/memory/memorySessionRepository.js";

const TTL_SECONDS = 60;

const newSession = (sid: string, userId = "u1") => ({
  sid,
  userId,
  jti: `${sid}-jti-1`,
  userAgent: "test",
  ip: "127.0.0.1",
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The contract every implementation (memory now, Redis next) must meet.
describe("session repository contract", () => {
  it("rotate is compare-and-set: only the current jti wins", async () => {
    const repo = createMemorySessionRepository();
    await repo.create(newSession("s1"), TTL_SECONDS);

    expect(await repo.rotate("s1", "s1-jti-1", "s1-jti-2", TTL_SECONDS)).toBe(
      true,
    );
    // a second request presenting the old jti loses
    expect(await repo.rotate("s1", "s1-jti-1", "s1-jti-3", TTL_SECONDS)).toBe(
      false,
    );

    const session = await repo.get("s1");
    expect(session?.jti).toBe("s1-jti-2");
    expect(session?.prevJti).toBe("s1-jti-1");
    await repo.close();
  });

  it("expires sessions after their TTL", async () => {
    const repo = createMemorySessionRepository();
    await repo.create(newSession("s1"), TTL_SECONDS);

    const later = Date.now() + (TTL_SECONDS + 1) * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);

    expect(await repo.get("s1")).toBeNull();
    expect(await repo.rotate("s1", "s1-jti-1", "x", TTL_SECONDS)).toBe(false);
    await repo.close();
  });

  it("deleteAllForUser can keep one session", async () => {
    const repo = createMemorySessionRepository();
    await repo.create(newSession("a"), TTL_SECONDS);
    await repo.create(newSession("b"), TTL_SECONDS);
    await repo.create(newSession("other", "u2"), TTL_SECONDS);

    await repo.deleteAllForUser("u1", { exceptSid: "a" });

    expect(await repo.get("a")).not.toBeNull();
    expect(await repo.get("b")).toBeNull();
    expect(await repo.get("other")).not.toBeNull();
    await repo.close();
  });

  it("returns copies, not live references", async () => {
    const repo = createMemorySessionRepository();
    await repo.create(newSession("s1"), TTL_SECONDS);

    const session = await repo.get("s1");
    if (session) session.jti = "tampered";

    expect((await repo.get("s1"))?.jti).toBe("s1-jti-1");
    await repo.close();
  });
});
