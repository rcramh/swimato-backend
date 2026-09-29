import type { Session, SessionRepository } from "../types.js";

/* ---------------------------------------------------------------
   Session repository — in-memory

   Development stand-in for Redis. A session is one signed-in device;
   it holds the jti of the only refresh token allowed to use it.

   Redis layout the real repository will use:

     session:<sid>        HASH { userId, jti, prevJti, rotatedAt,
                                 userAgent, ip, createdAt }
                          EXPIRE = refresh TTL, renewed on rotate
     user_sessions:<uid>  SET of sids, for "log out everywhere"

   rotate() must be atomic there (a Lua script), because two requests
   may present the same token at once. Here the event loop already
   makes it atomic: nothing between the read and the write awaits.
----------------------------------------------------------------*/

const SWEEP_INTERVAL_MS = 60 * 1000;

export function createMemorySessionRepository(): SessionRepository {
  const sessions = new Map<string, Session>();
  const sidsByUser = new Map<string, Set<string>>();

  const isExpired = (session: Session) => session.expiresAt <= Date.now();

  const remove = (sid: string) => {
    const session = sessions.get(sid);
    if (!session) return;

    sessions.delete(sid);
    const sids = sidsByUser.get(session.userId);
    sids?.delete(sid);
    if (sids?.size === 0) sidsByUser.delete(session.userId);
  };

  const live = (sid: string) => {
    const session = sessions.get(sid);
    if (!session) return undefined;
    if (!isExpired(session)) return session;

    remove(sid);
    return undefined;
  };

  // Redis expires keys itself; a Map needs a sweep, or abandoned
  // sessions would accumulate until restart.
  const sweeper = setInterval(() => {
    for (const [sid, session] of sessions) {
      if (isExpired(session)) remove(sid);
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  return {
    create({ sid, userId, jti, userAgent, ip }, ttlSeconds) {
      const now = Date.now();
      sessions.set(sid, {
        sid,
        userId,
        jti,
        prevJti: null,
        rotatedAt: null,
        userAgent,
        ip,
        createdAt: now,
        expiresAt: now + ttlSeconds * 1000,
      });

      const sids = sidsByUser.get(userId) ?? new Set<string>();
      sids.add(sid);
      sidsByUser.set(userId, sids);
      return Promise.resolve();
    },

    get(sid) {
      const session = live(sid);
      return Promise.resolve(session ? { ...session } : null);
    },

    rotate(sid, expectedJti, nextJti, ttlSeconds) {
      const session = live(sid);
      if (!session || session.jti !== expectedJti) {
        return Promise.resolve(false);
      }

      const now = Date.now();
      session.prevJti = session.jti;
      session.jti = nextJti;
      session.rotatedAt = now;
      session.expiresAt = now + ttlSeconds * 1000;
      return Promise.resolve(true);
    },

    delete(sid) {
      remove(sid);
      return Promise.resolve();
    },

    deleteAllForUser(userId, { exceptSid } = {}) {
      for (const sid of [...(sidsByUser.get(userId) ?? [])]) {
        if (sid !== exceptSid) remove(sid);
      }
      return Promise.resolve();
    },

    ping: () => Promise.resolve(),

    close() {
      clearInterval(sweeper);
      return Promise.resolve();
    },
  };
}
