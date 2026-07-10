const defaultDirectAdminTimeoutMs = 15000;
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-=?";

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text.replace(/\/+$/, "") : `https://${text.replace(/\/+$/, "")}`;
}

function getTimeoutMs(env) {
  const value = Number(env.DIRECTADMIN_TIMEOUT_MS || defaultDirectAdminTimeoutMs);
  return Number.isFinite(value) && value >= 1000 ? value : defaultDirectAdminTimeoutMs;
}

function basicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function parseDirectAdminResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith("<") || !trimmed.includes("=")) {
      return { raw: trimmed };
    }
    const params = new URLSearchParams(trimmed);
    return Object.fromEntries(params.entries());
  }
}

function responseHasError(result) {
  const value = result?.error;
  return value === 1 || value === "1" || value === true || value === "true";
}

function responseMessage(result) {
  return [result?.text, result?.details, result?.message]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function directAdminRawSnippet(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .trim();
}

function directAdminAuthMessage(response, result) {
  const raw = String(result?.raw || "");
  const message = responseMessage(result).toLowerCase();
  const looksLikeLoginPage = /<form|login|password|directadmin/i.test(raw);
  const looksLikeAuthError = response.status === 401 || response.status === 403 || message.includes("login") || message.includes("permission") || message.includes("denied");

  if (!looksLikeLoginPage && !looksLikeAuthError) {
    return "";
  }

  return "DirectAdmin rejected the request. Check that DIRECTADMIN_USERNAME matches the user that owns the login key, the login key is current, and the key allows CMD_API_POP without an incompatible IP restriction.";
}

export function getDirectAdminStatus(env) {
  const missing = ["DIRECTADMIN_URL", "DIRECTADMIN_USERNAME", "DIRECTADMIN_LOGIN_KEY", "DIRECTADMIN_DOMAIN"].filter((key) => !env[key]);
  return {
    configured: missing.length === 0,
    missing,
    url: normalizeUrl(env.DIRECTADMIN_URL),
    username: env.DIRECTADMIN_USERNAME || "",
    domain: env.DIRECTADMIN_DOMAIN || "",
    quotaMb: env.DIRECTADMIN_EMAIL_QUOTA_MB || "0",
    sendLimit: env.DIRECTADMIN_EMAIL_SEND_LIMIT || ""
  };
}

export function generateEmailPassword(length = 20) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => passwordAlphabet[byte % passwordAlphabet.length]).join("");
}

export function normalizeMailboxAddress(email, domain) {
  const address = String(email || "").trim().toLowerCase();
  const expectedDomain = String(domain || "").trim().toLowerCase();
  const [user, actualDomain] = address.split("@");

  if (!user || !actualDomain || actualDomain !== expectedDomain) {
    throw new Error(`Email address must be on ${expectedDomain}`);
  }

  if (!/^[a-z0-9._%+-]{1,64}$/.test(user)) {
    throw new Error("Email username contains unsupported characters");
  }

  return { accountEmail: `${user}@${expectedDomain}`, user, domain: expectedDomain };
}

export async function createDirectAdminEmailAccount(env, accountEmail, password) {
  const status = getDirectAdminStatus(env);
  if (!status.configured) {
    throw new Error(`Missing DirectAdmin configuration: ${status.missing.join(", ")}`);
  }

  const mailbox = normalizeMailboxAddress(accountEmail, status.domain);
  const endpoint = `${status.url}/CMD_API_POP?json=yes`;
  const body = new URLSearchParams({
    action: "create",
    domain: mailbox.domain,
    user: mailbox.user,
    passwd: password,
    passwd2: password,
    quota: String(status.quotaMb || "0")
  });

  if (status.sendLimit !== "") {
    body.set("limit", String(status.sendLimit));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs(env));

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": basicAuth(status.username, env.DIRECTADMIN_LOGIN_KEY),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("DirectAdmin API timed out while creating the mailbox");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  const result = parseDirectAdminResponse(text);
  const authMessage = directAdminAuthMessage(response, result);

  if (!response.ok || responseHasError(result)) {
    throw new Error(authMessage || responseMessage(result) || `DirectAdmin API request failed with HTTP ${response.status}`);
  }

  if (result?.raw) {
    const snippet = directAdminRawSnippet(result.raw);
    throw new Error(authMessage || `DirectAdmin returned an unexpected response${snippet ? `: ${snippet}` : ""}`);
  }

  return {
    accountEmail: mailbox.accountEmail,
    user: mailbox.user,
    domain: mailbox.domain,
    result
  };
}
