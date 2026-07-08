import { json, requireDb, workerError } from "../../../_lib/http.js";

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
