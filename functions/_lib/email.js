const defaultSmtpApiUrl = "https://smtpapi.mxroute.com/";
const defaultSmtpTimeoutMs = 12000;

export const emailTemplateVariables = [
  "full_name",
  "email",
  "job_title",
  "job_location",
  "job_employment_type",
  "lookup_code",
  "recovery_code",
  "check_url",
  "registration_url",
  "preferred_name",
  "account_email",
  "temporary_password"
];

export const defaultEmailTemplates = {
  confirmation: {
    key: "confirmation",
    label: "Application confirmation",
    subject: "Project Neura application received",
    body: [
      "Hi {{full_name}},",
      "",
      "Thanks for applying to {{job_title}}. We received your application.",
      "",
      "Your private check-back code is: {{lookup_code}}",
      "You can retrieve your submitted application here: {{check_url}}",
      "",
      "Keep this code somewhere safe. Project Neura staff will review your application and follow up if there is a fit.",
      "",
      "Project Neura"
    ].join("\n")
  },
  admitted: {
    key: "admitted",
    label: "Admission",
    subject: "Project Neura application update",
    body: [
      "Hi {{full_name}},",
      "",
      "Thank you for applying to {{job_title}}. We are pleased to let you know that your application has been admitted to the next stage.",
      "",
      "Please complete your member registration here: {{registration_url}}",
      "",
      "Project Neura"
    ].join("\n")
  },
  invited: {
    key: "invited",
    label: "Interview invitation",
    subject: "Project Neura interview invitation",
    body: [
      "Hi {{full_name}},",
      "",
      "Thank you for applying to {{job_title}}. We would like to invite you to interview with Project Neura.",
      "",
      "Project Neura staff will follow up shortly with scheduling details.",
      "",
      "Project Neura"
    ].join("\n")
  },
  rejected: {
    key: "rejected",
    label: "Rejection",
    subject: "Project Neura application update",
    body: [
      "Hi {{full_name}},",
      "",
      "Thank you for applying to {{job_title}}. After review, we will not be moving forward with your application for this role.",
      "",
      "We appreciate the time and care you put into applying, and we wish you the best in your search.",
      "",
      "Project Neura"
    ].join("\n")
  },
  recovery: {
    key: "recovery",
    label: "Application code recovery",
    subject: "Project Neura application code recovery",
    body: [
      "Hi,",
      "",
      "Use this verification code to retrieve your Project Neura application check-back code:",
      "",
      "{{recovery_code}}",
      "",
      "This verification code expires in 15 minutes.",
      "",
      "If you did not request this email, you can ignore it.",
      "",
      "Project Neura"
    ].join("\n")
  },
  account_credentials: {
    key: "account_credentials",
    label: "Email account credentials",
    subject: "Your Project Neura email account",
    body: [
      "Hi {{preferred_name}},",
      "",
      "Your Project Neura email account has been created.",
      "",
      "Email address: {{account_email}}",
      "Temporary password: {{temporary_password}}",
      "",
      "Please sign in and change this password after first use.",
      "",
      "Project Neura"
    ].join("\n")
  }
};

export const emailTemplateKeys = Object.keys(defaultEmailTemplates);

function getSmtpTimeoutMs(env) {
  const value = Number(env.SMTP_TIMEOUT_MS || defaultSmtpTimeoutMs);
  return Number.isFinite(value) && value >= 1000 ? value : defaultSmtpTimeoutMs;
}

export function getSmtpStatus(env) {
  const missing = ["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD"].filter((key) => !env[key]);
  return {
    configured: missing.length === 0,
    missing,
    apiUrl: env.SMTP_API_URL || defaultSmtpApiUrl,
    server: env.SMTP_HOST || "",
    username: env.SMTP_USERNAME || "",
    from: env.SMTP_FROM || (env.SMTP_USERNAME ? `Project Neura <${env.SMTP_USERNAME}>` : ""),
    replyTo: env.SMTP_REPLY_TO || env.SMTP_USERNAME || ""
  };
}

function hasSmtpConfig(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD);
}

function normalizeAddress(value, label = "Email address") {
  const text = String(value || "").trim();
  if (/[\r\n]/.test(text)) {
    throw new Error(`${label} contains unsupported line breaks`);
  }
  const match = text.match(/<([^>]+)>/);
  const address = (match ? match[1] : text).trim();
  if (/[\r\n<>]/.test(address) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error(`${label} is invalid`);
  }
  return address;
}

function normalizeSubject(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function normalizeTemplateRow(row) {
  const fallback = defaultEmailTemplates[row.key];
  return {
    key: row.key,
    label: fallback.label,
    subject: String(row.subject || fallback.subject),
    body: String(row.body || fallback.body),
    default_subject: fallback.subject,
    default_body: fallback.body
  };
}

export async function getEmailTemplates(db) {
  const defaults = emailTemplateKeys.map((key) => normalizeTemplateRow(defaultEmailTemplates[key]));
  if (!db) return defaults;

  try {
    const { results } = await db.prepare("SELECT key, subject, body FROM email_templates").all();
    const saved = new Map(results.map((row) => [row.key, row]));
    return emailTemplateKeys.map((key) => normalizeTemplateRow({
      key,
      subject: saved.get(key)?.subject || defaultEmailTemplates[key].subject,
      body: saved.get(key)?.body || defaultEmailTemplates[key].body
    }));
  } catch {
    return defaults;
  }
}

export async function getEmailTemplate(db, key) {
  const templates = await getEmailTemplates(db);
  return templates.find((template) => template.key === key) || normalizeTemplateRow(defaultEmailTemplates[key]);
}

function createTemplateContext(application, job = {}, extras = {}) {
  return {
    full_name: application.full_name || "",
    email: application.email || "",
    job_title: job.title || application.job_title || "the role",
    job_location: job.location || application.job_location || "",
    job_employment_type: job.employment_type || application.job_employment_type || "",
    lookup_code: application.lookup_code || "",
    recovery_code: extras.recoveryCode || extras.recovery_code || "",
    check_url: extras.checkUrl || extras.check_url || "",
    registration_url: extras.registrationUrl || extras.registration_url || ""
  };
}

function createMemberTemplateContext(member, extras = {}) {
  const preferredName = member.preferred_name || member.full_name || "";
  return {
    full_name: member.full_name || "",
    preferred_name: preferredName,
    email: member.personal_email || "",
    job_title: member.job_title || "",
    lookup_code: member.lookup_code || "",
    account_email: extras.accountEmail || extras.account_email || member.account_email || "",
    temporary_password: extras.temporaryPassword || extras.temporary_password || ""
  };
}

export function renderEmailTemplate(value, context) {
  return String(value || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(context, name)) {
      return context[name];
    }
    return "";
  });
}

export async function sendSmtp(env, message) {
  if (!hasSmtpConfig(env)) {
    const status = getSmtpStatus(env);
    throw new Error(`Missing SMTP configuration: ${status.missing.join(", ")}`);
  }

  const apiUrl = env.SMTP_API_URL || defaultSmtpApiUrl;
  const fromAddress = normalizeAddress(message.from || env.SMTP_FROM || env.SMTP_USERNAME, "From address");
  const timeoutMs = getSmtpTimeoutMs(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    server: env.SMTP_HOST,
    username: env.SMTP_USERNAME,
    password: env.SMTP_PASSWORD,
    from: fromAddress,
    to: normalizeAddress(message.to, "Recipient address"),
    subject: normalizeSubject(message.subject),
    body: textToHtml(message.text || message.body || "")
  };

  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("SMTP API timed out while sending email");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(result.message || `SMTP API request failed with HTTP ${response.status}`);
  }

  return result;
}

export async function sendApplicationConfirmation(env, db, application, job, checkUrl) {
  if (!hasSmtpConfig(env)) {
    return { skipped: true, reason: "missing_smtp_config" };
  }

  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const template = await getEmailTemplate(db, "confirmation");
  const context = createTemplateContext(application, job, { checkUrl });

  await sendSmtp(env, {
    from,
    replyTo,
    to: application.email,
    subject: renderEmailTemplate(template.subject, context),
    text: renderEmailTemplate(template.body, context)
  });

  return { sent: true };
}

export async function sendApplicationDecisionEmail(env, db, application, job, decision, extras = {}) {
  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const template = defaultEmailTemplates[decision] ? await getEmailTemplate(db, decision) : null;

  if (!template) {
    throw new Error("Invalid email decision");
  }
  const context = createTemplateContext(application, job, extras);

  await sendSmtp(env, {
    from,
    replyTo,
    to: application.email,
    subject: renderEmailTemplate(template.subject, context),
    text: renderEmailTemplate(template.body, context)
  });

  return { sent: true };
}

export async function sendApplicationRecoveryCode(env, db, email, recoveryCode) {
  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const template = await getEmailTemplate(db, "recovery");
  const context = createTemplateContext({ email }, {}, { recoveryCode });

  await sendSmtp(env, {
    from,
    replyTo,
    to: email,
    subject: renderEmailTemplate(template.subject, context),
    text: renderEmailTemplate(template.body, context)
  });

  return { sent: true };
}

export async function sendMemberAccountCredentials(env, db, member, credentials) {
  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const template = await getEmailTemplate(db, "account_credentials");
  const context = createMemberTemplateContext(member, credentials);

  await sendSmtp(env, {
    from,
    replyTo,
    to: member.personal_email,
    subject: renderEmailTemplate(template.subject, context),
    text: renderEmailTemplate(template.body, context)
  });

  return { sent: true };
}
