import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hasSmtpConfig(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD);
}

function encodeBase64(value) {
  return btoa(value);
}

function normalizeAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return match ? match[1] : text;
}

function dotStuff(value) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function createLineReader(socket) {
  const reader = socket.readable.getReader();
  let buffer = "";

  return async function readResponse() {
    while (true) {
      const lineEnd = buffer.indexOf("\r\n");
      if (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const lines = [line];
        while (true) {
          const nextEnd = buffer.indexOf("\r\n");
          if (nextEnd === -1) break;
          const nextLine = buffer.slice(0, nextEnd);
          buffer = buffer.slice(nextEnd + 2);
          lines.push(nextLine);
          if (/^\d{3} /.test(nextLine)) {
            return lines;
          }
        }
        if (/^\d{3} /.test(line)) {
          return lines;
        }
      }

      const { value, done } = await reader.read();
      if (done) {
        throw new Error("SMTP connection closed unexpectedly");
      }
      buffer += decoder.decode(value, { stream: true });
    }
  };
}

function assertSmtpOk(lines, expectedCodes) {
  const finalLine = lines[lines.length - 1] || "";
  const code = Number(finalLine.slice(0, 3));
  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP error: ${lines.join(" | ")}`);
  }
}

async function writeCommand(writer, command) {
  await writer.write(encoder.encode(`${command}\r\n`));
}

function buildMessage({ from, replyTo, to, subject, text }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    replyTo ? `Reply-To: ${replyTo}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ].filter(Boolean);

  return `${headers.join("\r\n")}\r\n\r\n${dotStuff(text)}\r\n.`;
}

async function sendSmtp(env, message) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 587);
  const secureTransport = env.SMTP_SECURE || (port === 465 ? "on" : "starttls");
  const from = env.SMTP_FROM || env.SMTP_USERNAME;
  const fromAddress = normalizeAddress(from);
  const toAddress = normalizeAddress(message.to);
  let socket = connect({ hostname: host, port }, { secureTransport });
  await socket.opened;
  let readResponse = createLineReader(socket);
  let writer = socket.writable.getWriter();

  try {
    assertSmtpOk(await readResponse(), [220]);
    await writeCommand(writer, `EHLO ${env.SMTP_HELO || "projectneura.org"}`);
    assertSmtpOk(await readResponse(), [250]);

    if (secureTransport === "starttls") {
      await writeCommand(writer, "STARTTLS");
      assertSmtpOk(await readResponse(), [220]);
      writer.releaseLock();
      socket = socket.startTls();
      await socket.opened;
      readResponse = createLineReader(socket);
      writer = socket.writable.getWriter();
      await writeCommand(writer, `EHLO ${env.SMTP_HELO || "projectneura.org"}`);
      assertSmtpOk(await readResponse(), [250]);
    }

    await writeCommand(writer, "AUTH LOGIN");
    assertSmtpOk(await readResponse(), [334]);
    await writeCommand(writer, encodeBase64(env.SMTP_USERNAME));
    assertSmtpOk(await readResponse(), [334]);
    await writeCommand(writer, encodeBase64(env.SMTP_PASSWORD));
    assertSmtpOk(await readResponse(), [235]);
    await writeCommand(writer, `MAIL FROM:<${fromAddress}>`);
    assertSmtpOk(await readResponse(), [250]);
    await writeCommand(writer, `RCPT TO:<${toAddress}>`);
    assertSmtpOk(await readResponse(), [250, 251]);
    await writeCommand(writer, "DATA");
    assertSmtpOk(await readResponse(), [354]);
    await writeCommand(writer, buildMessage({ ...message, from }));
    assertSmtpOk(await readResponse(), [250]);
    await writeCommand(writer, "QUIT");
    assertSmtpOk(await readResponse(), [221]);
  } finally {
    try {
      writer.releaseLock();
    } catch {}
    await socket.close().catch(() => {});
  }
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
