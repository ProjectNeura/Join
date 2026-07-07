import { defaultEmailTemplates, emailTemplateKeys, emailTemplateVariables, getEmailTemplates } from "../../../_lib/email.js";
import { error, json, normalizeText, readJson, requireDb, workerError } from "../../../_lib/http.js";

function normalizeTemplateInput(body) {
  return {
    key: normalizeText(body.key),
    subject: normalizeText(body.subject).slice(0, 200),
    body: String(body.body || "").trim().slice(0, 6000)
  };
}

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    return json({
      templates: await getEmailTemplates(db),
      variables: emailTemplateVariables
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const template = normalizeTemplateInput(body);

    if (!emailTemplateKeys.includes(template.key)) {
      return error("Invalid email template", 422);
    }

    const fallback = defaultEmailTemplates[template.key];
    const subject = template.subject || fallback.subject;
    const text = template.body || fallback.body;

    await db.prepare(`
      INSERT INTO email_templates (key, subject, body, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        subject = excluded.subject,
        body = excluded.body,
        updated_at = CURRENT_TIMESTAMP
    `).bind(template.key, subject, text).run();

    const templates = await getEmailTemplates(db);
    return json({
      template: templates.find((item) => item.key === template.key),
      templates
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
