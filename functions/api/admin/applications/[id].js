import { applicationStatuses, error, json, normalizeApplicationStatus, readJson, requireDb, workerError } from "../../../_lib/http.js";

export async function onRequestPatch({ params, request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);

    if (!applicationStatuses.includes(body.status)) {
      return error("Invalid application status", 422);
    }

    const status = normalizeApplicationStatus(body.status);
    const result = await db.prepare("UPDATE applications SET status = ? WHERE id = ?")
      .bind(status, params.id)
      .run();

    if (!result.meta?.changes) {
      return error("Application not found", 404);
    }

    return json({ application: { id: params.id, status } });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
