import { error, json, normalizeText, readJson, requireDb, workerError } from "../../../../_lib/http.js";
import { createDirectAdminEmailAccount, generateEmailPassword, getDirectAdminStatus } from "../../../../_lib/directadmin.js";
import { getSmtpStatus, sendMemberAccountCredentials } from "../../../../_lib/email.js";

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: normalizeText(item?.id),
    account_email: normalizeText(item?.account_email).toLowerCase()
  })).filter((item) => item.id).slice(0, 100);
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const items = normalizeItems(body.items);

    if (!items.length) {
      return error("Select at least one member", 422);
    }

    const missingCredentials = items.filter((item) => !item.account_email);
    if (missingCredentials.length) {
      return error("Every selected member needs a Project Neura email address.", 422);
    }

    const directAdmin = getDirectAdminStatus(env);
    if (!directAdmin.configured) {
      return error(`Missing DirectAdmin configuration: ${directAdmin.missing.join(", ")}`, 422);
    }

    const smtp = getSmtpStatus(env);
    if (!smtp.configured) {
      return error(`Missing SMTP configuration: ${smtp.missing.join(", ")}`, 422);
    }

    const placeholders = items.map(() => "?").join(", ");
    const { results } = await db.prepare(`
      SELECT *
      FROM members
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `).bind(...items.map((item) => item.id)).all();
    const credentialsById = new Map(items.map((item) => [item.id, item]));
    const sent = [];
    const failed = [];

    for (const member of results) {
      const credentials = credentialsById.get(member.id);
      const temporaryPassword = generateEmailPassword();
      let mailboxCreated = false;
      try {
        await createDirectAdminEmailAccount(env, credentials.account_email, temporaryPassword);
        mailboxCreated = true;
        await db.prepare(`
          UPDATE members
          SET account_email = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(credentials.account_email, member.id).run();
        await sendMemberAccountCredentials(env, db, member, {
          accountEmail: credentials.account_email,
          temporaryPassword
        });
        await db.prepare(`
          UPDATE members
          SET account_email = ?, credentials_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(credentials.account_email, member.id).run();
        sent.push({
          id: member.id,
          full_name: member.full_name,
          personal_email: member.personal_email,
          account_email: credentials.account_email
        });
      } catch (sendError) {
        failed.push({
          id: member.id,
          full_name: member.full_name,
          personal_email: member.personal_email,
          error: sendError instanceof Error ? sendError.message : "Email failed"
        });
        if (mailboxCreated) {
          failed[failed.length - 1].error = `${failed[failed.length - 1].error} Mailbox was created, but credentials were not emailed. Reset the mailbox password in DirectAdmin before retrying.`;
        }
      }
    }

    const foundIds = new Set(results.map((member) => member.id));
    for (const item of items) {
      if (!foundIds.has(item.id)) {
        failed.push({ id: item.id, error: "Member not found" });
      }
    }

    return json({ sent, failed });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
