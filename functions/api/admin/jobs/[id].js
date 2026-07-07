import { error, json, normalizeFormFields, normalizeStandardFields, normalizeText, readJson, requireDb, required, workerError } from "../../../_lib/http.js";

const allowedStatuses = new Set(["draft", "open", "closed"]);

export async function onRequestPatch({ request, env, params }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    if (body.title) {
      const status = allowedStatuses.has(body.status) ? body.status : "draft";
      const standardFields = normalizeStandardFields(body.standard_fields);
      const formFields = normalizeFormFields(body.form_fields);
      const result = await db.prepare(`
        UPDATE jobs
        SET title = ?,
            team = ?,
            location = ?,
            employment_type = ?,
            salary = ?,
            summary = ?,
            description = ?,
            requirements = ?,
            standard_fields = ?,
            form_fields = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        required(body.title, "Title"),
        normalizeText(body.team),
        normalizeText(body.location),
        normalizeText(body.employment_type) || "Full-time",
        normalizeText(body.salary),
        required(body.summary, "Summary"),
        required(body.description, "Description"),
        normalizeText(body.requirements),
        JSON.stringify(standardFields),
        JSON.stringify(formFields),
        status,
        params.id
      ).run();

      if (!result.meta.changes) {
        return error("Job post not found", 404);
      }
      return json({ ok: true });
    }

    if (!allowedStatuses.has(body.status)) {
      return error("Invalid status", 422);
    }
    const result = await db.prepare(`
      UPDATE jobs
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(body.status, params.id).run();

    if (!result.meta.changes) {
      return error("Job post not found", 404);
    }
    return json({ ok: true });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = requireDb(env);
    const applicationDelete = await db.prepare("DELETE FROM applications WHERE job_id = ?").bind(params.id).run();
    const result = await db.prepare("DELETE FROM jobs WHERE id = ?").bind(params.id).run();
    if (!result.meta.changes) {
      return error("Job post not found", 404);
    }
    return json({
      ok: true,
      deleted_applications: applicationDelete.meta?.changes || 0
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
