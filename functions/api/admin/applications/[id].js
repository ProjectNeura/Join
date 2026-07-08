import { applicationStatuses, error, json, normalizeApplicationStatus, readJson, requireDb, workerError } from "../../../_lib/http.js";

export async function onRequestPatch({ params, request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);

    if (!applicationStatuses.includes(body.status)) {
      return error("Invalid application status", 422);
    }

    const status = normalizeApplicationStatus(body.status);
    const existing = await db.prepare("SELECT status, decision_sent_status FROM applications WHERE id = ?")
      .bind(params.id)
      .first();

    if (!existing) {
      return error("Application not found", 404);
    }

    const shouldClearDecisionSent = existing.decision_sent_status && existing.decision_sent_status !== status;
    const result = await db.prepare(`
      UPDATE applications
      SET
        status = ?,
        decision_sent_at = CASE WHEN ? THEN NULL ELSE decision_sent_at END,
        decision_sent_status = CASE WHEN ? THEN NULL ELSE decision_sent_status END
      WHERE id = ?
    `)
      .bind(status, shouldClearDecisionSent ? 1 : 0, shouldClearDecisionSent ? 1 : 0, params.id)
      .run();

    if (!result.meta?.changes) {
      return error("Application not found", 404);
    }

    return json({ application: { id: params.id, status } });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
