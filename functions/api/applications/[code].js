import { error, json, normalizeLookupCode, publicApplicationStatus, requireDb, workerError } from "../../_lib/http.js";

export async function onRequestGet({ env, params }) {
  try {
    const db = requireDb(env);
    const lookupCode = normalizeLookupCode(params.code);

    if (!lookupCode) {
      return error("Application code is required", 422);
    }

    const application = await db.prepare(`
      SELECT
        applications.id,
        applications.lookup_code,
        applications.full_name,
        applications.email,
        applications.phone,
        applications.location,
        applications.portfolio_url,
        applications.linkedin_url,
        applications.resume_url,
        applications.work_authorization,
        applications.cover_letter,
        applications.custom_answers,
        applications.status,
        applications.invitation_sent_at,
        applications.decision_sent_at,
        applications.decision_sent_status,
        applications.created_at,
        jobs.title AS job_title,
        jobs.slug AS job_slug,
        jobs.status AS job_status,
        jobs.team AS job_team,
        jobs.location AS job_location,
        jobs.employment_type AS job_employment_type
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.lookup_code = ?
    `).bind(lookupCode).first();

    if (!application) {
      return error("No application found for that code", 404);
    }

    try {
      application.custom_answers = application.custom_answers ? JSON.parse(application.custom_answers) : [];
    } catch {
      application.custom_answers = [];
    }
    const publicStatus = publicApplicationStatus(application);
    application.can_withdraw = application.job_status === "open" && !["admitted", "rejected"].includes(publicStatus);
    application.withdraw_blocked_reason = ["admitted", "rejected"].includes(publicStatus)
      ? "A decision has already been sent for this application."
      : "";
    application.status = publicStatus;
    delete application.invitation_sent_at;
    delete application.decision_sent_at;
    delete application.decision_sent_status;

    return json({ application });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = requireDb(env);
    const lookupCode = normalizeLookupCode(params.code);

    if (!lookupCode) {
      return error("Application code is required", 422);
    }

    const application = await db.prepare(`
      SELECT
        applications.id,
        applications.status,
        applications.invitation_sent_at,
        applications.decision_sent_at,
        applications.decision_sent_status,
        jobs.status AS job_status
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.lookup_code = ?
    `).bind(lookupCode).first();

    if (!application) {
      return error("No application found for that code", 404);
    }

    if (application.job_status !== "open") {
      return error("This application can only be withdrawn while the job post is still open.", 409);
    }

    if (["admitted", "rejected"].includes(publicApplicationStatus(application))) {
      return error("This application can no longer be withdrawn because a decision has already been sent.", 409);
    }

    await db.prepare("DELETE FROM applications WHERE id = ?").bind(application.id).run();

    return json({ ok: true });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
