import { applicationStatuses, error, json, readJson, requireDb, workerError } from "../../../../_lib/http.js";
import { getSmtpStatus, sendApplicationDecisionEmail } from "../../../../_lib/email.js";

const emailDecisions = ["invited", "admitted", "rejected"];
const decisionLabels = {
  invited: "Interview invitation",
  admitted: "Admission",
  rejected: "Rejection"
};
const statusLabels = {
  invited: "invited",
  admitted: "admitted",
  rejected: "rejected"
};

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const ids = normalizeIds(body.ids);
    const decision = body.decision;

    if (!ids.length) {
      return error("Select at least one applicant", 422);
    }

    if (!emailDecisions.includes(decision) || !applicationStatuses.includes(decision)) {
      return error("Choose interview invitation, admission, or rejection", 422);
    }

    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await db.prepare(`
      SELECT
        applications.*,
        jobs.title AS job_title,
        jobs.location AS job_location,
        jobs.employment_type AS job_employment_type
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.id IN (${placeholders})
      ORDER BY applications.created_at DESC
    `).bind(...ids).all();

    const mismatchedSelections = results.filter((application) => application.status !== decision);

    if (mismatchedSelections.length) {
      return error(`${decisionLabels[decision]} emails are blocked because ${mismatchedSelections.length} selected applicant${mismatchedSelections.length === 1 ? " is" : "s are"} not marked ${statusLabels[decision]}.`, 409);
    }

    const smtp = getSmtpStatus(env);
    if (!smtp.configured) {
      return error(`Missing SMTP configuration: ${smtp.missing.join(", ")}`, 422);
    }

    const sent = [];
    const failed = [];

    for (const application of results) {
      try {
        await sendApplicationDecisionEmail(env, db, application, {
          title: application.job_title,
          location: application.job_location,
          employment_type: application.job_employment_type
        }, decision);
        sent.push({
          id: application.id,
          full_name: application.full_name,
          email: application.email
        });
      } catch (sendError) {
        failed.push({
          id: application.id,
          full_name: application.full_name,
          email: application.email,
          error: sendError instanceof Error ? sendError.message : "Email failed"
        });
      }
    }

    const foundIds = new Set(results.map((application) => application.id));
    for (const id of ids) {
      if (!foundIds.has(id)) {
        failed.push({ id, error: "Application not found" });
      }
    }

    return json({
      decision,
      sent,
      failed
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
