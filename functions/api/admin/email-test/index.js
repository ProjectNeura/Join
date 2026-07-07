import { getSmtpStatus, sendSmtp } from "../../../_lib/email.js";
import { json, normalizeText, readJson, workerError } from "../../../_lib/http.js";

export async function onRequestGet({ env }) {
  return json({ smtp: getSmtpStatus(env) });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const smtp = getSmtpStatus(env);
    const to = normalizeText(body.to) || smtp.username;

    if (!to) {
      throw new Error("Test recipient is required");
    }

    await sendSmtp(env, {
      from: smtp.from,
      replyTo: smtp.replyTo,
      to,
      subject: "Project Neura email test",
      text: [
        "Project Neura email delivery test",
        "",
        "If you received this message, the application portal can connect to SMTP and send email.",
        "",
        `Sent at: ${new Date().toISOString()}`
      ].join("\n")
    });

    return json({
      sent: true,
      to,
      smtp
    });
  } catch (errorValue) {
    return workerError(errorValue);
  }
}
