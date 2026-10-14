import session from "express-session";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function expiry(value: session.SessionData): Date {
  const cookie = value.cookie;
  if (cookie.expires) return new Date(cookie.expires);
  return new Date(Date.now() + (cookie.maxAge ?? DEFAULT_MAX_AGE_MS));
}

export class PostgresSessionStore extends session.Store {
  private readonly pruneTimer: NodeJS.Timeout;

  constructor() {
    super();
    this.pruneTimer = setInterval(() => {
      pool.query("DELETE FROM app_sessions WHERE expire <= NOW()").catch((error: unknown) => logger.error({ error }, "Expired session pruning failed"));
    }, 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  get(sid: string, callback: (error?: Error | null, session?: session.SessionData | null) => void): void {
    pool.query<{ sess: session.SessionData }>(
      "SELECT sess FROM app_sessions WHERE sid = $1 AND expire > NOW()",
      [sid],
    ).then((result) => callback(null, result.rows[0]?.sess ?? null), callback);
  }

  set(sid: string, value: session.SessionData, callback?: (error?: Error | null) => void): void {
    pool.query(
      "INSERT INTO app_sessions (sid, sess, expire) VALUES ($1, $2, $3) ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire",
      [sid, JSON.stringify(value), expiry(value)],
    ).then(() => callback?.(null), (error: Error) => callback?.(error));
  }

  destroy(sid: string, callback?: (error?: Error | null) => void): void {
    pool.query("DELETE FROM app_sessions WHERE sid = $1", [sid])
      .then(() => callback?.(null), (error: Error) => callback?.(error));
  }

  touch(sid: string, value: session.SessionData, callback?: (error?: Error | null) => void): void {
    pool.query("UPDATE app_sessions SET expire = $2 WHERE sid = $1", [sid, expiry(value)])
      .then(() => callback?.(null), (error: Error) => callback?.(error));
  }
}
