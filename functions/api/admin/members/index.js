import { error, json, normalizeText, readJson, requireDb, workerError } from "../../../_lib/http.js";

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    const { results } = await db.prepare(`
      SELECT
        members.*,
        applications.status AS application_status,
        applications.decision_sent_at AS application_decision_sent_at,
        applications.decision_sent_status AS application_decision_sent_status
      FROM members
      LEFT JOIN applications ON applications.id = members.application_id
      ORDER BY members.created_at DESC
    `).all();

    return json({ members: results });
  } catch (error) {
    return workerError(error);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.map(normalizeText).filter(Boolean).slice(0, 100)
      : [];

    if (!ids.length) {
      return error("Select at least one member to delete", 422);
    }

    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await db.prepare(`
      SELECT id, full_name, personal_email, account_email
      FROM members
      WHERE id IN (${placeholders})
    `).bind(...ids).all();

    if (!results.length) {
      return error("No matching members found", 404);
    }

    await db.prepare(`
      DELETE FROM members
      WHERE id IN (${placeholders})
    `).bind(...results.map((member) => member.id)).run();

    return json({ deleted: results });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
