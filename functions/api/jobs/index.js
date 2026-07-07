import { json, requireDb, workerError } from "../../_lib/http.js";

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    const { results } = await db.prepare(`
      SELECT id, title, slug, team, location, employment_type, salary, summary, created_at
      FROM jobs
      WHERE status = 'open'
      ORDER BY created_at DESC
    `).all();
    return json({ jobs: results });
  } catch (error) {
    return workerError(error);
  }
}
