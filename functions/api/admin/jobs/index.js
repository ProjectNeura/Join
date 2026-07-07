import { json, normalizeFormFields, normalizeStandardFields, normalizeText, readJson, requireDb, required, uniqueSlug, workerError } from "../../../_lib/http.js";

const allowedStatuses = new Set(["draft", "open", "closed"]);

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    const { results } = await db.prepare(`
      SELECT id, title, slug, team, location, employment_type, salary, summary, description, requirements, standard_fields, form_fields, status, created_at, updated_at
      FROM jobs
      ORDER BY created_at DESC
    `).all();
    return json({
      jobs: results.map((job) => ({
        ...job,
        standard_fields: normalizeStandardFields(job.standard_fields),
        form_fields: normalizeFormFields(job.form_fields)
      }))
    });
  } catch (error) {
    return workerError(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const title = required(body.title, "Title");
    const status = allowedStatuses.has(body.status) ? body.status : "draft";
    const slug = await uniqueSlug(db, title);
    const job = {
      id: crypto.randomUUID(),
      title,
      slug,
      team: normalizeText(body.team),
      location: normalizeText(body.location),
      employment_type: normalizeText(body.employment_type) || "Full-time",
      salary: normalizeText(body.salary),
      summary: required(body.summary, "Summary"),
      description: required(body.description, "Description"),
      requirements: normalizeText(body.requirements),
      standard_fields: normalizeStandardFields(body.standard_fields),
      form_fields: normalizeFormFields(body.form_fields),
      status
    };

    await db.prepare(`
      INSERT INTO jobs (
        id, title, slug, team, location, employment_type, salary, summary,
        description, requirements, standard_fields, form_fields, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      job.id,
      job.title,
      job.slug,
      job.team,
      job.location,
      job.employment_type,
      job.salary,
      job.summary,
      job.description,
      job.requirements,
      JSON.stringify(job.standard_fields),
      JSON.stringify(job.form_fields),
      job.status
    ).run();

    return json({ job }, { status: 201 });
  } catch (error) {
    return workerError(error);
  }
}
