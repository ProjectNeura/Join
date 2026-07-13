import { error, json, normalizeEmail, normalizeText, publicApplicationStatus, readJson, requireDb, workerError } from "../../../_lib/http.js";

function normalizeRecoveryCode(value) {
  return normalizeText(value).replace(/\D/g, "").slice(0, 6);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const code = normalizeRecoveryCode(body.code);

    if (code.length !== 6) {
      return error("Enter the 6-digit verification code.", 422);
    }

    const recoveryCode = await db.prepare(`
      SELECT id
      FROM application_recovery_codes
      WHERE email = ?
        AND code = ?
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(email, code).first();

    if (!recoveryCode) {
      return error("Verification code is invalid or expired.", 404);
    }

    const { results } = await db.prepare(`
      SELECT
        applications.lookup_code,
        applications.created_at,
        applications.status,
        applications.invitation_sent_at,
        applications.decision_sent_at,
        applications.decision_sent_status,
        jobs.title AS job_title,
        jobs.slug AS job_slug,
        jobs.status AS job_status,
        jobs.team AS job_team
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE lower(trim(applications.email)) = lower(trim(?))
      ORDER BY applications.created_at DESC
    `).bind(email).all();

    await db.prepare("UPDATE application_recovery_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(recoveryCode.id)
      .run();

    return json({
      applications: results.map((application) => ({
        lookup_code: application.lookup_code,
        created_at: application.created_at,
        status: publicApplicationStatus(application),
        job_title: application.job_title || "Deleted job post",
        job_slug: application.job_slug,
        job_status: application.job_status,
        job_team: application.job_team || ""
      }))
    });
  } catch (errorValue) {
    const message = normalizeText(errorValue?.message);
    if (message.includes("no such table: application_recovery_codes")) {
      return error("Recovery is not available until the latest database migration is applied.", 503);
    }
    return workerError(errorValue);
  }
}
