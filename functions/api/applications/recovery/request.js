import { error, json, normalizeText, readJson, requireDb, required, workerError } from "../../../_lib/http.js";
import { sendApplicationRecoveryCode } from "../../../_lib/email.js";

const recoveryMessage = "If that email matches an application, we sent a verification code.";

function normalizeEmail(value) {
  return required(value, "Email").toLowerCase();
}

function generateRecoveryCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = bytes.reduce((total, byte) => (total * 256) + byte, 0) % 1000000;
  return String(value).padStart(6, "0");
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);

    const application = await db.prepare(`
      SELECT id
      FROM applications
      WHERE lower(trim(email)) = lower(trim(?))
      LIMIT 1
    `).bind(email).first();

    if (!application) {
      return json({ ok: true, message: recoveryMessage });
    }

    const recentCode = await db.prepare(`
      SELECT id
      FROM application_recovery_codes
      WHERE email = ? AND created_at > datetime('now', '-1 minute')
      LIMIT 1
    `).bind(email).first();

    if (recentCode) {
      return json({ ok: true, message: recoveryMessage });
    }

    await db.prepare("DELETE FROM application_recovery_codes WHERE expires_at <= CURRENT_TIMESTAMP OR created_at < datetime('now', '-1 day')").run();

    const code = generateRecoveryCode();
    await db.prepare(`
      INSERT INTO application_recovery_codes (id, email, code, expires_at)
      VALUES (?, ?, ?, datetime('now', '+15 minutes'))
    `).bind(crypto.randomUUID(), email, code).run();

    try {
      await sendApplicationRecoveryCode(env, db, email, code);
    } catch {
      return error("Could not send a recovery email right now. Please try again later.", 502);
    }

    return json({ ok: true, message: recoveryMessage });
  } catch (errorValue) {
    if (errorValue instanceof Error && errorValue.message.includes("Email is required")) {
      return workerError(errorValue);
    }
    const message = normalizeText(errorValue?.message);
    if (message.includes("no such table: application_recovery_codes")) {
      return error("Recovery is not available until the latest database migration is applied.", 503);
    }
    return workerError(errorValue);
  }
}
