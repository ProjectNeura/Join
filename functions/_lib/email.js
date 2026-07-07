const defaultSmtpApiUrl = "https://smtpapi.mxroute.com/";
const defaultSmtpTimeoutMs = 12000;

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

function normalizeAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return match ? match[1] : text;
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

export async function sendSmtp(env, message) {
  if (!hasSmtpConfig(env)) {
    const status = getSmtpStatus(env);
    throw new Error(`Missing SMTP configuration: ${status.missing.join(", ")}`);
  }

  const apiUrl = env.SMTP_API_URL || defaultSmtpApiUrl;
  const fromAddress = normalizeAddress(message.from || env.SMTP_FROM || env.SMTP_USERNAME);
  const timeoutMs = getSmtpTimeoutMs(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    server: env.SMTP_HOST,
    username: env.SMTP_USERNAME,
    password: env.SMTP_PASSWORD,
    from: fromAddress,
    to: normalizeAddress(message.to),
    subject: message.subject,
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

export async function sendApplicationConfirmation(env, application, job, checkUrl) {
  if (!hasSmtpConfig(env)) {
    return { skipped: true, reason: "missing_smtp_config" };
  }

  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const subject = "Project Neura application received";
  const text = [
    `Hi ${application.full_name},`,
    "",
    `Thanks for applying to ${job.title}. We received your application.`,
    "",
    `Your private check-back code is: ${application.lookup_code}`,
    `You can retrieve your submitted application here: ${checkUrl}`,
    "",
    "Keep this code somewhere safe. Project Neura staff will review your application and follow up if there is a fit.",
    "",
    "Project Neura"
  ].join("\n");

  await sendSmtp(env, {
    from,
    replyTo,
    to: application.email,
    subject,
    text
  });

  return { sent: true };
}

export async function sendApplicationDecisionEmail(env, application, job, decision) {
  const from = env.SMTP_FROM || `Project Neura <${env.SMTP_USERNAME}>`;
  const replyTo = env.SMTP_REPLY_TO || env.SMTP_USERNAME;
  const roleTitle = job?.title || application.job_title || "the role";
  const templates = {
    admitted: {
      subject: "Project Neura application update",
      text: [
        `Hi ${application.full_name},`,
        "",
        `Thank you for applying to ${roleTitle}. We are pleased to let you know that your application has been admitted to the next stage.`,
        "",
        "Project Neura staff will follow up with next steps shortly.",
        "",
        "Project Neura"
      ].join("\n")
    },
    rejected: {
      subject: "Project Neura application update",
      text: [
        `Hi ${application.full_name},`,
        "",
        `Thank you for applying to ${roleTitle}. After review, we will not be moving forward with your application for this role.`,
        "",
        "We appreciate the time and care you put into applying, and we wish you the best in your search.",
        "",
        "Project Neura"
      ].join("\n")
    }
  };
  const template = templates[decision];

  if (!template) {
    throw new Error("Invalid email decision");
  }

  await sendSmtp(env, {
    from,
    replyTo,
    to: application.email,
    subject: template.subject,
    text: template.text
  });

  return { sent: true };
}
