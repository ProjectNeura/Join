import { error, json, normalizeEmail, normalizeFormFields, normalizeHttpsUrl, normalizeStandardFields, normalizeText, readJson, requireDb, required, uniqueLookupCode, workerError } from "../../_lib/http.js";
import { sendApplicationConfirmation } from "../../_lib/email.js";

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const db = requireDb(env);
    const body = await readJson(request);
    const jobSlug = required(body.job_slug, "Job");
    const job = await db.prepare("SELECT id, title, location, employment_type, standard_fields, form_fields FROM jobs WHERE slug = ? AND status = 'open'")
      .bind(jobSlug)
      .first();

    if (!job) {
      return error("This job is no longer accepting applications", 404);
    }

    const email = normalizeEmail(body.email);
    const existingApplication = await db.prepare(`
      SELECT lookup_code
      FROM applications
      WHERE job_id = ? AND lower(trim(email)) = lower(trim(?))
      LIMIT 1
    `).bind(job.id, email).first();

    if (existingApplication) {
      return error("This email address has already submitted an application for this job. Use your check-back code to view or withdraw the existing application before submitting again.", 409);
    }

    const standardFields = normalizeStandardFields(job.standard_fields);
    const formFields = normalizeFormFields(job.form_fields);
    const standardValues = Object.fromEntries(standardFields.map((field) => [
      field.id,
      normalizeText(body[field.id])
    ]));
    for (const field of standardFields) {
      if (!field.shown) {
        standardValues[field.id] = "";
        continue;
      }
      if (field.shown && field.required && !standardValues[field.id]) {
        throw new Error(`${field.label} is required`);
      }
      if (field.type === "url") {
        standardValues[field.id] = normalizeHttpsUrl(standardValues[field.id], field.label);
      }
    }
    const submittedAnswers = body.custom_answers && typeof body.custom_answers === "object" ? body.custom_answers : {};
    const customAnswers = formFields.map((field) => {
      const rawValue = submittedAnswers[field.id];
      let value = "";
      if (field.type === "multi_select") {
        const rawValues = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
        const allowedOptions = new Set(field.options);
        value = rawValues
          .map(normalizeText)
          .filter(Boolean)
          .filter((option, index, options) => options.indexOf(option) === index);
        if (field.options.length && value.some((option) => !allowedOptions.has(option))) {
          throw new Error(`${field.label} must use the available options`);
        }
      } else {
        value = Array.isArray(rawValue) ? normalizeText(rawValue[0]) : normalizeText(rawValue);
      }
      if (field.required && (Array.isArray(value) ? value.length === 0 : !value)) {
        throw new Error(`${field.label} is required`);
      }
      if (field.type === "select" && value && field.options.length && !field.options.includes(value)) {
        throw new Error(`${field.label} must be one of the available options`);
      }
      if (field.type === "url") {
        value = normalizeHttpsUrl(value, field.label);
      }
      return {
        id: field.id,
        label: field.label,
        type: field.type,
        value
      };
    });

    const application = {
      id: crypto.randomUUID(),
      job_id: job.id,
      full_name: required(body.full_name, "Full name"),
      email,
      phone: standardValues.phone,
      location: standardValues.location,
      portfolio_url: standardValues.portfolio_url,
      linkedin_url: standardValues.linkedin_url,
      resume_url: standardValues.resume_url,
      work_authorization: standardValues.work_authorization,
      cover_letter: standardValues.cover_letter,
      custom_answers: customAnswers,
      lookup_code: await uniqueLookupCode(db)
    };

    await db.prepare(`
      INSERT INTO applications (
        id, job_id, full_name, email, phone, location, portfolio_url, linkedin_url,
        resume_url, work_authorization, cover_letter, custom_answers, lookup_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      application.id,
      application.job_id,
      application.full_name,
      application.email,
      application.phone,
      application.location,
      application.portfolio_url,
      application.linkedin_url,
      application.resume_url,
      application.work_authorization,
      application.cover_letter,
      JSON.stringify(application.custom_answers),
      application.lookup_code
    ).run();

    const checkUrl = new URL("/check", request.url).toString();
    const emailTask = sendApplicationConfirmation(env, db, application, job, checkUrl)
      .catch((emailError) => console.warn("Application confirmation email failed", emailError));
    if (typeof waitUntil === "function") {
      waitUntil(emailTask);
    } else {
      await emailTask;
    }

    return json({
      application: {
        id: application.id,
        lookup_code: application.lookup_code
      }
    }, { status: 201 });
  } catch (errorValue) {
    if (errorValue instanceof Error && errorValue.message.includes("idx_applications_job_email_unique")) {
      return error("This email address has already submitted an application for this job. Use your check-back code to view or withdraw the existing application before submitting again.", 409);
    }
    return workerError(errorValue);
  }
}
