import { applicationStatuses, error, json, readJson, requireDb, workerError } from "../../../../_lib/http.js";
import { getSmtpStatus, sendApplicationDecisionEmail } from "../../../../_lib/email.js";

const emailDecisions = ["admitted", "rejected"];

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
      return error("Choose admission or rejection", 422);
    }

    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await db.prepare(`
      SELECT applications.*, jobs.title AS job_title
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.id IN (${placeholders})
      ORDER BY applications.created_at DESC
    `).bind(...ids).all();

    const admittedSelections = results.filter((application) => application.status === "admitted");
    const rejectedSelections = results.filter((application) => application.status === "rejected");

    if (decision === "admitted" && rejectedSelections.length) {
      return error(`Admission emails are blocked because ${rejectedSelections.length} selected applicant${rejectedSelections.length === 1 ? " is" : "s are"} already rejected.`, 409);
    }

    if (decision === "rejected" && admittedSelections.length) {
      return error(`Rejection emails are blocked because ${admittedSelections.length} selected applicant${admittedSelections.length === 1 ? " is" : "s are"} already admitted.`, 409);
    }

    const smtp = getSmtpStatus(env);
    if (!smtp.configured) {
      return error(`Missing SMTP configuration: ${smtp.missing.join(", ")}`, 422);
    }

    const sent = [];
    const failed = [];

    for (const application of results) {
      try {
        await sendApplicationDecisionEmail(env, application, { title: application.job_title }, decision);
        await db.prepare("UPDATE applications SET status = ? WHERE id = ?")
          .bind(decision, application.id)
          .run();
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
