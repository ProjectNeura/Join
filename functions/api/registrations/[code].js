import { error, json, normalizeLookupCode, normalizeText, publicApplicationStatus, readJson, requireDb, required, workerError } from "../../_lib/http.js";

const textFields = [
  "preferred_name",
  "phone",
  "country_region",
  "timezone",
  "affiliation",
  "role_title",
  "start_date",
  "github_url",
  "mailing_address",
  "emergency_contact",
  "emergency_contact_phone",
  "notes"
];

async function getAdmittedApplication(db, code) {
  const lookupCode = normalizeLookupCode(code);
  if (!lookupCode) {
    throw new Error("Application code is required");
  }

  const application = await db.prepare(`
    SELECT
      applications.id,
      applications.lookup_code,
      applications.job_id,
      applications.full_name,
      applications.email,
      applications.phone,
      applications.status,
      applications.invitation_sent_at,
      applications.decision_sent_at,
      applications.decision_sent_status,
      jobs.title AS job_title
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.job_id
    WHERE applications.lookup_code = ?
  `).bind(lookupCode).first();

  if (!application) {
    throw new Error("No application found for that code");
  }

  if (publicApplicationStatus(application) !== "admitted") {
    throw new Error("Registration is available after admission has been sent.");
  }

  return application;
}

function normalizeMemberPayload(body, application) {
  const member = {
    full_name: required(body.full_name || application.full_name, "Full name"),
    personal_email: required(body.personal_email || application.email, "Personal email")
  };

  for (const field of textFields) {
    member[field] = normalizeText(body[field]).slice(0, field === "notes" || field === "mailing_address" ? 1200 : 240);
  }

  if (!member.preferred_name) {
    member.preferred_name = member.full_name.split(/\s+/)[0] || member.full_name;
  }
  if (!member.role_title) {
    member.role_title = normalizeText(application.job_title);
  }

  return member;
}

function normalizeMember(row) {
  if (!row) return null;
  return {
    ...row,
    registered: true
  };
}

export async function onRequestGet({ env, params }) {
  try {
    const db = requireDb(env);
    const application = await getAdmittedApplication(db, params.code);
    const member = await db.prepare("SELECT * FROM members WHERE application_id = ?")
      .bind(application.id)
      .first();

    return json({
      application: {
        lookup_code: application.lookup_code,
        full_name: application.full_name,
        email: application.email,
        phone: application.phone,
        job_title: application.job_title || "Project Neura role"
      },
      member: normalizeMember(member)
    });
  } catch (errorValue) {
    const message = normalizeText(errorValue?.message);
    const status = message.includes("No application") ? 404 : message.includes("available after admission") ? 403 : 422;
    return error(message || "Registration is unavailable", status);
  }
}

export async function onRequestPost({ request, env, params }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const application = await getAdmittedApplication(db, params.code);
    const member = normalizeMemberPayload(body, application);
    const existing = await db.prepare("SELECT id FROM members WHERE application_id = ?")
      .bind(application.id)
      .first();

    if (existing) {
      await db.prepare(`
        UPDATE members
        SET
          full_name = ?,
          preferred_name = ?,
          personal_email = ?,
          phone = ?,
          country_region = ?,
          timezone = ?,
          affiliation = ?,
          role_title = ?,
          start_date = ?,
          github_url = ?,
          mailing_address = ?,
          emergency_contact = ?,
          emergency_contact_phone = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        member.full_name,
        member.preferred_name,
        member.personal_email,
        member.phone,
        member.country_region,
        member.timezone,
        member.affiliation,
        member.role_title,
        member.start_date,
        member.github_url,
        member.mailing_address,
        member.emergency_contact,
        member.emergency_contact_phone,
        member.notes,
        existing.id
      ).run();
    } else {
      await db.prepare(`
        INSERT INTO members (
          id, application_id, lookup_code, job_id, job_title, full_name, preferred_name,
          personal_email, phone, country_region, timezone, affiliation, role_title,
          start_date, github_url, mailing_address,
          emergency_contact, emergency_contact_phone, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        application.id,
        application.lookup_code,
        application.job_id,
        application.job_title || "",
        member.full_name,
        member.preferred_name,
        member.personal_email,
        member.phone,
        member.country_region,
        member.timezone,
        member.affiliation,
        member.role_title,
        member.start_date,
        member.github_url,
        member.mailing_address,
        member.emergency_contact,
        member.emergency_contact_phone,
        member.notes
      ).run();
    }

    const saved = await db.prepare("SELECT * FROM members WHERE application_id = ?")
      .bind(application.id)
      .first();

    return json({ member: normalizeMember(saved) }, { status: existing ? 200 : 201 });
  } catch (errorValue) {
    const message = normalizeText(errorValue?.message);
    if (message.includes("No application")) return error(message, 404);
    if (message.includes("available after admission")) return error(message, 403);
    return workerError(errorValue);
  }
}
