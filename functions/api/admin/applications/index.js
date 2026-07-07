import { json, requireDb, workerError } from "../../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("job_id");
    const base = `
      SELECT applications.*, jobs.title AS job_title, jobs.slug AS job_slug
      FROM applications
      LEFT JOIN jobs ON jobs.id = applications.job_id
    `;
    const statement = jobId
      ? db.prepare(`${base} WHERE applications.job_id = ? ORDER BY applications.created_at DESC`).bind(jobId)
      : db.prepare(`${base} ORDER BY applications.created_at DESC`);
    const { results } = await statement.all();
    return json({
      applications: results.map((application) => {
        try {
          return {
            ...application,
            custom_answers: application.custom_answers ? JSON.parse(application.custom_answers) : []
          };
        } catch {
          return {
            ...application,
            custom_answers: []
          };
        }
      })
    });
  } catch (error) {
    return workerError(error);
  }
}
