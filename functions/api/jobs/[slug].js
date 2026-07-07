import { error, json, normalizeFormFields, normalizeStandardFields, requireDb, workerError } from "../../_lib/http.js";

export async function onRequestGet({ env, params }) {
  try {
    const db = requireDb(env);
    const job = await db.prepare(`
      SELECT id, title, slug, team, location, employment_type, salary, summary, description, requirements, standard_fields, form_fields, created_at
      FROM jobs
      WHERE slug = ? AND status = 'open'
    `).bind(params.slug).first();
    if (!job) {
      return error("Job post not found", 404);
    }
    return json({
      job: {
        ...job,
        standard_fields: normalizeStandardFields(job.standard_fields),
        form_fields: normalizeFormFields(job.form_fields)
      }
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
