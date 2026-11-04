/* D1-backed brute-force throttle for the auth endpoints.
 * Rows key on a bucket string (e.g. "login|<username>|<ip>"), so a lockout
 * only affects the attacking IP + account pair — never the account globally,
 * and never other users from the same network. The table self-creates on
 * first use (same pattern as user_data), and every helper fails open:
 * a throttle error must never break sign-in itself. */

async function ensure(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS auth_throttle (k TEXT PRIMARY KEY, fails INTEGER NOT NULL, window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)"
  ).run();
}

export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}

/* Seconds left on the lock for this bucket, or 0 when not locked. */
export async function throttleCheck(db, key) {
  try {
    await ensure(db);
    const row = await db.prepare("SELECT locked_until FROM auth_throttle WHERE k = ?1")
      .bind(key)
      .first();
    if (row && row.locked_until > Date.now()) {
      return Math.ceil((row.locked_until - Date.now()) / 1000);
    }
  } catch { /* fail open */ }
  return 0;
}

/* Record one failed attempt; reaching max inside the window starts a lock. */
export async function throttleFail(db, key, max, windowMs, lockMs) {
  try {
    await ensure(db);
    const now = Date.now();
    const row = await db.prepare("SELECT fails, window_start FROM auth_throttle WHERE k = ?1")
      .bind(key)
      .first();
    let fails = 1, start = now;
    if (row && now - row.window_start < windowMs) {
      fails = row.fails + 1;
      start = row.window_start;
    }
    const locked = fails >= max ? now + lockMs : 0;
    await db.prepare(
      "INSERT INTO auth_throttle (k, fails, window_start, locked_until) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT(k) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start, locked_until = excluded.locked_until"
    ).bind(key, fails, start, locked).run();
  } catch { /* fail open */ }
}

export async function throttleClear(db, key) {
  try {
    await ensure(db);
    await db.prepare("DELETE FROM auth_throttle WHERE k = ?1").bind(key).run();
  } catch { /* fail open */ }
}
