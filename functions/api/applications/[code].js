import { error, json, normalizeLookupCode, requireDb, workerError } from "../../_lib/http.js";

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
        applications.created_at,
        jobs.title AS job_title,
        jobs.slug AS job_slug,
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

    return json({ application });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
