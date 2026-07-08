const app = document.querySelector("#app");

const state = {
  adminTab: "jobs",
  adminJobs: [],
  applications: [],
  applicationJobId: "all",
  applicationStatusFilter: "all",
  applicationEmailFilter: "all",
  selectedApplicationIds: new Set(),
  applicationNotice: null,
  editingJobId: null,
  emailTemplates: [],
  emailTemplateVariables: []
};

const defaultStandardFields = [
  { id: "phone", label: "Phone", type: "text", shown: true, required: false },
  { id: "location", label: "Location", type: "text", shown: true, required: false },
  { id: "portfolio_url", label: "Portfolio URL", type: "url", shown: true, required: false },
  { id: "linkedin_url", label: "LinkedIn URL", type: "url", shown: true, required: false },
  { id: "resume_url", label: "Resume URL", type: "url", shown: true, required: false },
  { id: "work_authorization", label: "Work authorization", type: "text", shown: true, required: false },
  { id: "cover_letter", label: "Cover letter", type: "textarea", shown: true, required: true }
];

const applicationStatusOptions = [
  { value: "under_review", label: "Under review" },
  { value: "invited", label: "Invited" },
  { value: "admitted", label: "Admitted" },
  { value: "rejected", label: "Rejected" }
];

const applicationEmailFilterOptions = [
  { value: "all", label: "All email states" },
  { value: "invitation_sent", label: "Invitation sent" },
  { value: "invitation_unsent", label: "Invitation not sent" },
  { value: "decision_sent", label: "Decision sent" },
  { value: "decision_unsent", label: "Decision not sent" }
];

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

const nl2br = (value = "") => escapeHtml(value).replace(/\n/g, "<br>");

function safeHref(value = "") {
  const text = String(value || "").trim();
  try {
    const url = new URL(text, window.location.origin);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) {
      return escapeHtml(url.href);
    }
  } catch {
    return "";
  }
  return "";
}

function renderMarkdownInline(value = "") {
  const tokens = [];
  const token = (html) => {
    const key = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let text = String(value || "").replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safeUrl = safeHref(href);
    if (!safeUrl) return escapeHtml(label);
    return token(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${renderMarkdownInline(label)}</a>`);
  });

  let html = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");

  tokens.forEach((htmlValue, index) => {
    html = html.replaceAll(`\u0000${index}\u0000`, htmlValue);
  });
  return html;
}

function renderMarkdown(value = "") {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let codeFence = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderMarkdownInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(`<${list.type}>${list.items.map((item) => `<li>${renderMarkdownInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  const flushCodeFence = () => {
    if (!codeFence) return;
    blocks.push(`<pre><code>${escapeHtml(codeFence.lines.join("\n"))}</code></pre>`);
    codeFence = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (codeFence) {
      if (trimmed.startsWith("```")) {
        flushCodeFence();
      } else {
        codeFence.lines.push(line);
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      codeFence = { lines: [] };
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(6, heading[1].length + 2);
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCodeFence();
  return blocks.join("");
}

const formatDate = (value) => {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
};

function formatApplicationStatus(value) {
  return applicationStatusOptions.find((status) => status.value === value)?.label || "Under review";
}

function applicationStatusClass(value) {
  if (value === "invited") return "invited";
  if (value === "admitted") return "admitted";
  if (value === "rejected") return "rejected";
  return "under-review";
}

function batchEmailActionLabel(decision) {
  if (decision === "invited") return "interview invitation";
  if (decision === "admitted") return "admission";
  if (decision === "rejected") return "rejection";
  return formatApplicationStatus(decision).toLowerCase();
}

function hasInvitationSent(application) {
  return Boolean(application?.invitation_sent_at);
}

function hasDecisionSent(application) {
  return ["admitted", "rejected"].includes(application?.status) &&
    application?.decision_sent_status === application.status &&
    Boolean(application?.decision_sent_at);
}

function matchesApplicationEmailFilter(application) {
  if (state.applicationEmailFilter === "invitation_sent") return hasInvitationSent(application);
  if (state.applicationEmailFilter === "invitation_unsent") return !hasInvitationSent(application);
  if (state.applicationEmailFilter === "decision_sent") return hasDecisionSent(application);
  if (state.applicationEmailFilter === "decision_unsent") return !hasDecisionSent(application);
  return true;
}

function canSendApplicationEmail(application, decision) {
  if (!application || application.status !== decision) return false;
  if (decision === "invited") return !hasInvitationSent(application);
  return !hasDecisionSent(application);
}

const request = async (url, options = {}) => {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {})
      },
      ...fetchOptions,
      ...(controller ? { signal: controller.signal } : {})
    }).catch((error) => {
      if (error.name === "AbortError") {
        throw new Error("Request timed out. The email server did not respond.");
      }
      throw error;
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const setActiveNav = () => {
  document.querySelectorAll(".nav a").forEach((link) => {
    const active = link.getAttribute("href") === location.pathname ||
      (link.getAttribute("href") === "/" && location.pathname.startsWith("/jobs/")) ||
      (link.getAttribute("href") === "/check" && location.pathname.startsWith("/check")) ||
      (link.getAttribute("href") === "/admin" && location.pathname.startsWith("/admin"));
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

const navigate = (path) => {
  history.pushState({}, "", path);
  render();
};

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-link]");
  if (!link || link.origin && link.origin !== location.origin) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});

window.addEventListener("popstate", render);

function metaHtml(job) {
  return [job.location, job.employment_type, job.salary]
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fieldInputName(id) {
  return `custom_${id}`;
}

function renderCustomApplicationFields(fields) {
  return parseArray(fields).map((field) => {
    const required = field.required ? "required" : "";
    const label = `${escapeHtml(field.label)}${field.required ? " *" : ""}`;
    const hint = field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : "";
    const name = fieldInputName(field.id);

    if (field.type === "textarea") {
      return `<label class="full"><span>${label}</span>${hint}<textarea name="${escapeHtml(name)}" ${required}></textarea></label>`;
    }

    if (field.type === "url") {
      return `<label class="full"><span>${label}</span>${hint}<input name="${escapeHtml(name)}" type="url" inputmode="url" ${required}></label>`;
    }

    if (field.type === "select") {
      const options = parseArray(field.options);
      return `
        <label class="full"><span>${label}</span>${hint}
          <select name="${escapeHtml(name)}" ${required}>
            <option value="">Select an option</option>
            ${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
      `;
    }

    return `<label class="full"><span>${label}</span>${hint}<input name="${escapeHtml(name)}" ${required}></label>`;
  }).join("");
}

function renderStandardApplicationFields(fields) {
  return parseArray(fields).filter((field) => field.shown).map((field) => {
    const required = field.required ? "required" : "";
    const label = `${escapeHtml(field.label)}${field.required ? " *" : ""}`;

    if (field.type === "textarea") {
      return `<label class="full">${label}<textarea name="${escapeHtml(field.id)}" ${required}></textarea></label>`;
    }

    if (field.type === "url") {
      const placeholder = field.id === "resume_url" ? ' placeholder="Link to PDF, Drive, or portfolio profile"' : "";
      return `<label class="full">${label}<input name="${escapeHtml(field.id)}" type="url" inputmode="url"${placeholder} ${required}></label>`;
    }

    return `<label>${label}<input name="${escapeHtml(field.id)}" ${required}></label>`;
  }).join("");
}

function collectCustomAnswers(form, fields) {
  const data = new FormData(form);
  return Object.fromEntries(parseArray(fields).map((field) => [
    field.id,
    data.get(fieldInputName(field.id)) || ""
  ]));
}

function renderCustomAnswers(answers) {
  const rows = parseArray(answers).filter((answer) => answer.value);
  if (!rows.length) return "";
  return `
    <div class="answer-list">
      ${rows.map((answer) => `
        <div class="answer-row">
          <strong>${escapeHtml(answer.label)}</strong>
          <p>${nl2br(answer.value)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLoading(label = "Loading") {
  app.innerHTML = `<div class="page"><div class="loading">${label}</div></div>`;
}

function renderError(error) {
  app.innerHTML = `
    <div class="page">
      <div class="notice error">${escapeHtml(error.message || error)}</div>
    </div>
  `;
}

function renderApplicationDetails(application) {
  const withdrawMarkup = application.can_withdraw ? `
    <div class="withdraw-box">
      <div>
        <strong>Withdraw this application</strong>
        <p class="muted">This job is still open, so you can withdraw and submit a new application for the same role.</p>
      </div>
      <button class="danger" type="button" data-withdraw-application="${escapeHtml(application.lookup_code)}">Withdraw application</button>
    </div>
  ` : "";
  return `
    <article class="application-card retrieved-application">
      <div class="panel-toolbar">
        <div>
          <p class="eyebrow">Application found</p>
          <h3>${escapeHtml(application.full_name)}</h3>
          <p>${escapeHtml(application.job_title || "Project Neura role")} • ${escapeHtml(formatDate(application.created_at))}</p>
        </div>
        <span class="status-pill ${applicationStatusClass(application.status)}">${escapeHtml(formatApplicationStatus(application.status))}</span>
      </div>
      <div class="lookup-code" aria-label="Application code">${escapeHtml(application.lookup_code)}</div>
      <div class="inline-list">
        <span>${escapeHtml(application.email)}</span>
        ${application.phone ? `<span>${escapeHtml(application.phone)}</span>` : ""}
        ${application.location ? `<span>${escapeHtml(application.location)}</span>` : ""}
        ${application.job_location ? `<span>${escapeHtml(application.job_location)}</span>` : ""}
        ${application.job_employment_type ? `<span>${escapeHtml(application.job_employment_type)}</span>` : ""}
      </div>
      ${application.resume_url ? `<p><strong>Resume:</strong> <a href="${escapeHtml(application.resume_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.resume_url)}</a></p>` : ""}
      ${application.portfolio_url ? `<p><strong>Portfolio:</strong> <a href="${escapeHtml(application.portfolio_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.portfolio_url)}</a></p>` : ""}
      ${application.linkedin_url ? `<p><strong>LinkedIn:</strong> <a href="${escapeHtml(application.linkedin_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.linkedin_url)}</a></p>` : ""}
      ${application.work_authorization ? `<p><strong>Work authorization:</strong> ${escapeHtml(application.work_authorization)}</p>` : ""}
      ${renderCustomAnswers(application.custom_answers)}
      <p class="prose">${nl2br(application.cover_letter)}</p>
      ${withdrawMarkup}
    </article>
  `;
}

async function renderHome() {
  renderLoading("Loading open roles");
  const { jobs } = await request("/api/jobs");
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Careers at Project Neura</p>
        <h1>Unknown is the challenge.</h1>
        <p>Join the team extending the frontier of machine learning.</p>
        <div class="hero-actions">
          <a class="button primary" href="#open-roles">See open roles</a>
          <a class="button" href="/check" data-link>Check an application</a>
        </div>
      </div>
      <div class="hero-art" role="img" aria-label="Abstract neural network visual"></div>
    </section>
    <section class="jobs-grid" id="open-roles" aria-label="Open roles"></section>
  `;
  const grid = app.querySelector(".jobs-grid");
  if (!jobs.length) {
    grid.innerHTML = '<div class="empty">No open roles are posted yet.</div>';
    return;
  }
  const template = document.querySelector("#job-card-template");
  for (const job of jobs) {
    const card = template.content.cloneNode(true);
    card.querySelector(".eyebrow").textContent = job.team || "Project Neura";
    card.querySelector("h2").textContent = job.title;
    card.querySelector(".summary").innerHTML = renderMarkdown(job.summary);
    card.querySelector(".meta").innerHTML = metaHtml(job);
    const apply = card.querySelector(".button");
    apply.href = `/jobs/${job.slug}`;
    apply.setAttribute("aria-label", `Apply for ${job.title}`);
    grid.appendChild(card);
  }
}

async function renderJob(slug) {
  renderLoading("Loading role");
  const { job } = await request(`/api/jobs/${encodeURIComponent(slug)}`);
  const standardFields = parseArray(job.standard_fields);
  const formFields = parseArray(job.form_fields);
  app.innerHTML = `
    <section class="page job-detail">
      <div class="panel">
        <p class="eyebrow">${escapeHtml(job.team || "Project Neura")}</p>
        <h1>${escapeHtml(job.title)}</h1>
        <div class="meta">${metaHtml(job)}</div>
        <h2>About the role</h2>
        <div class="prose">${renderMarkdown(job.description || job.summary)}</div>
        ${job.requirements ? `<h2>What we are looking for</h2><div class="prose">${renderMarkdown(job.requirements)}</div>` : ""}
      </div>
      <form class="panel" id="application-form">
        <h2>Apply for this role</h2>
        <div id="form-notice"></div>
        <div class="form-grid">
          <label>Full name *<input name="full_name" autocomplete="name" required></label>
          <label>Email *<input name="email" type="email" autocomplete="email" required></label>
          ${renderStandardApplicationFields(standardFields)}
          ${renderCustomApplicationFields(formFields)}
        </div>
        <div class="form-actions">
          <button class="primary" type="submit">Submit application</button>
          <a class="button ghost" href="/" data-link>Back to jobs</a>
        </div>
      </form>
    </section>
  `;
  app.querySelector("#application-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const notice = form.querySelector("#form-notice");
    const button = form.querySelector("button[type='submit']");
    const payload = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    notice.innerHTML = "";
    try {
      const { application } = await request("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          job_slug: job.slug,
          custom_answers: collectCustomAnswers(form, formFields)
        })
      });
      form.reset();
      notice.innerHTML = `
        <div class="notice">
          <strong>Application received.</strong>
          <p>Save this private check-back code. We will also email it to you when email delivery is configured.</p>
          <div class="lookup-code">${escapeHtml(application.lookup_code)}</div>
          <a class="button ghost" href="/check" data-link>Check this application later</a>
        </div>
      `;
    } catch (error) {
      notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  });
}

function renderCheck() {
  app.innerHTML = `
    <section class="page check-page">
      <div class="page-head">
        <p class="eyebrow">Application check-back</p>
        <h1>Retrieve your submitted application.</h1>
        <p>Enter the private code you received after submitting. If you lost it, verify your email to recover the code.</p>
      </div>
      <div class="check-layout">
        <div class="check-tools">
          <form class="panel" id="check-form">
            <h2>Enter your code</h2>
            <div id="check-notice"></div>
            <label class="full">Application code <input name="lookup_code" autocomplete="off" placeholder="PN-XXXX-XXXX-XXXX-XXXX" required></label>
            <div class="form-actions">
              <button class="primary" type="submit">Retrieve application</button>
              <a class="button ghost" href="/" data-link>Back to jobs</a>
            </div>
          </form>
          <form class="panel recovery-panel" id="recovery-request-form">
            <h2>Lost your code?</h2>
            <p class="muted">Send a verification code to the email address used on your application.</p>
            <div id="recovery-request-notice"></div>
            <label class="full">Email <input name="email" type="email" autocomplete="email" required></label>
            <div class="form-actions">
              <button type="submit">Send verification code</button>
            </div>
          </form>
          <form class="panel recovery-panel" id="recovery-verify-form">
            <h2>Verify email</h2>
            <div id="recovery-verify-notice"></div>
            <label class="full">Email <input name="email" type="email" autocomplete="email" required></label>
            <label class="full">Verification code <input name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="123456" required></label>
            <div class="form-actions">
              <button type="submit">Recover application code</button>
            </div>
          </form>
        </div>
        <div id="check-result" class="check-result"></div>
      </div>
    </section>
  `;

  app.querySelector("#check-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const notice = form.querySelector("#check-notice");
    const result = app.querySelector("#check-result");
    const button = form.querySelector("button[type='submit']");
    const code = new FormData(form).get("lookup_code");
    notice.innerHTML = "";
    result.innerHTML = "";
    button.disabled = true;
    try {
      const { application } = await request(`/api/applications/${encodeURIComponent(code)}`);
      result.innerHTML = renderApplicationDetails(application);
      result.querySelector("[data-withdraw-application]")?.addEventListener("click", () => withdrawApplication(application, result, notice));
    } catch (error) {
      notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  });

  app.querySelector("#recovery-request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const notice = form.querySelector("#recovery-request-notice");
    const button = form.querySelector("button[type='submit']");
    const email = new FormData(form).get("email");
    notice.innerHTML = "";
    button.disabled = true;
    try {
      const response = await request("/api/applications/recovery/request", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      app.querySelector("#recovery-verify-form").elements.email.value = email;
      notice.innerHTML = `<p class="notice">${escapeHtml(response.message || "If that email matches an application, we sent a verification code.")}</p>`;
    } catch (error) {
      notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  });

  app.querySelector("#recovery-verify-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const notice = form.querySelector("#recovery-verify-notice");
    const result = app.querySelector("#check-result");
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    notice.innerHTML = "";
    result.innerHTML = "";
    button.disabled = true;
    try {
      const response = await request("/api/applications/recovery/verify", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          code: data.get("code")
        })
      });
      result.innerHTML = renderRecoveredApplicationCodes(response.applications);
      bindRecoveredCodeButtons(result);
    } catch (error) {
      notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  });
}

function renderRecoveredApplicationCodes(applications) {
  const rows = parseArray(applications);
  if (!rows.length) {
    return `
      <div class="panel">
        <h2>No applications found</h2>
        <p class="muted">No submitted applications are currently tied to that email address.</p>
      </div>
    `;
  }

  return `
    <div class="panel recovered-codes">
      <h2>Recovered application codes</h2>
      <div class="recovery-list">
        ${rows.map((application) => `
          <article class="answer-row">
            <div class="panel-toolbar">
              <div>
                <strong>${escapeHtml(application.job_title)}</strong>
                <p class="muted">${escapeHtml([application.job_team, application.created_at ? `Submitted ${formatDate(application.created_at)}` : ""].filter(Boolean).join(" · "))}</p>
              </div>
              <span class="status-pill ${applicationStatusClass(application.status)}">${escapeHtml(formatApplicationStatus(application.status))}</span>
            </div>
            <div class="lookup-code">${escapeHtml(application.lookup_code)}</div>
            <button type="button" data-recovered-code="${escapeHtml(application.lookup_code)}">View application</button>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function bindRecoveredCodeButtons(container) {
  container.querySelectorAll("[data-recovered-code]").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.recoveredCode;
      const checkForm = app.querySelector("#check-form");
      const notice = checkForm.querySelector("#check-notice");
      const result = app.querySelector("#check-result");
      checkForm.elements.lookup_code.value = code;
      notice.innerHTML = "";
      button.disabled = true;
      try {
        const { application } = await request(`/api/applications/${encodeURIComponent(code)}`);
        result.innerHTML = renderApplicationDetails(application);
        result.querySelector("[data-withdraw-application]")?.addEventListener("click", () => withdrawApplication(application, result, notice));
      } catch (error) {
        notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
        button.disabled = false;
      }
    });
  });
}

async function withdrawApplication(application, result, notice) {
  const confirmed = window.confirm("Withdraw this application? This deletes the submitted application and frees this email address to apply for the same open job again.");
  if (!confirmed) return;

  const button = result.querySelector("[data-withdraw-application]");
  button.disabled = true;
  notice.innerHTML = "";
  try {
    await request(`/api/applications/${encodeURIComponent(application.lookup_code)}`, { method: "DELETE" });
    result.innerHTML = `
      <div class="notice">
        <strong>Application withdrawn.</strong>
        <p>You can submit a new application while the job post remains open.</p>
        ${application.job_slug ? `<a class="button ghost" href="/jobs/${escapeHtml(application.job_slug)}" data-link>Apply again</a>` : ""}
      </div>
    `;
  } catch (error) {
    notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
    button.disabled = false;
  }
}

async function renderAdmin() {
  renderLoading("Loading admin panel");
  await loadAdminData();
  app.innerHTML = `
    <section class="admin-layout">
      <div class="page-head">
        <p class="eyebrow">Staff area</p>
        <h1>Admin panel</h1>
      </div>
      <div class="toolbar">
        <div class="admin-tabs" role="group" aria-label="Admin sections">
          <button type="button" data-admin-tab="jobs" aria-pressed="${state.adminTab === "jobs"}">Jobs</button>
          <button type="button" data-admin-tab="applications" aria-pressed="${state.adminTab === "applications"}">Applications</button>
          <button type="button" data-admin-tab="email" aria-pressed="${state.adminTab === "email"}">Email</button>
        </div>
      </div>
      <div id="admin-content"></div>
    </section>
  `;
  app.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab;
      renderAdmin();
    });
  });
  renderAdminContent();
}

async function loadAdminData() {
  const [{ jobs }, { applications }] = await Promise.all([
    request("/api/admin/jobs"),
    request("/api/admin/applications")
  ]);
  state.adminJobs = jobs;
  state.applications = applications;
  const existingIds = new Set(applications.map((application) => application.id));
  state.selectedApplicationIds = new Set([...state.selectedApplicationIds].filter((id) => existingIds.has(id)));
}

function renderAdminContent() {
  if (state.adminTab === "applications") {
    renderApplicationsAdmin();
  } else if (state.adminTab === "email") {
    renderEmailAdmin();
  } else {
    renderJobsAdmin();
  }
}

function renderJobsAdmin() {
  const container = app.querySelector("#admin-content");
  const editingJob = state.adminJobs.find((job) => job.id === state.editingJobId);
  const standardFields = editingJob ? parseArray(editingJob.standard_fields) : defaultStandardFields;
  const fields = parseArray(editingJob?.form_fields);
  container.innerHTML = `
    <div class="admin-grid">
      <form class="panel" id="job-form">
        <div class="panel-toolbar">
          <h2>${editingJob ? "Edit job post" : "Create job post"}</h2>
          ${editingJob ? '<button class="ghost" type="button" data-job-cancel-edit>Cancel</button>' : ""}
        </div>
        <div id="job-form-notice"></div>
        <div class="form-grid">
          <label class="full">Title <input name="title" value="${escapeHtml(editingJob?.title || "")}" required></label>
          <label>Team <input name="team" value="${escapeHtml(editingJob?.team || "")}" placeholder="Research"></label>
          <label>Location <input name="location" value="${escapeHtml(editingJob?.location || "")}" placeholder="Remote, Toronto, hybrid"></label>
          <label>Employment type <input name="employment_type" value="${escapeHtml(editingJob?.employment_type || "Full-time")}"></label>
          <label>Salary range <input name="salary" value="${escapeHtml(editingJob?.salary || "")}" placeholder="Optional"></label>
          <label class="full">Summary <span class="field-hint">Markdown supported on the job card.</span><textarea name="summary" required>${escapeHtml(editingJob?.summary || "")}</textarea></label>
          <label class="full">Description <span class="field-hint">Markdown supported on the job post.</span><textarea name="description" required>${escapeHtml(editingJob?.description || "")}</textarea></label>
          <label class="full">Requirements <span class="field-hint">Markdown supported on the job post.</span><textarea name="requirements">${escapeHtml(editingJob?.requirements || "")}</textarea></label>
          <label>Status
            <select name="status">
              ${["draft", "open", "closed"].map((status) => `<option value="${status}" ${(editingJob?.status || "draft") === status ? "selected" : ""}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="field-builder">
          <div class="panel-toolbar">
            <div>
              <h3>Built-in fields</h3>
              <p class="muted">Full name and email are always collected. Remove or require the other standard fields for this role.</p>
            </div>
          </div>
          <div class="standard-field-list">
            ${standardFields.map((field) => renderStandardFieldRow(field)).join("")}
          </div>
          <div class="panel-toolbar">
            <div>
              <h3>Custom fields</h3>
              <p class="muted">Add role-specific questions to the applicant form.</p>
            </div>
            <button type="button" data-field-add>Add field</button>
          </div>
          <div class="field-list" id="field-list">
            ${fields.map((field) => renderFieldBuilderRow(field)).join("")}
          </div>
        </div>
        <div class="form-actions">
          <button class="primary" type="submit">${editingJob ? "Save changes" : "Create post"}</button>
        </div>
      </form>
      <div class="panel">
        <div class="panel-toolbar">
          <h2>Job posts</h2>
          <span class="status-pill">${state.adminJobs.length} total</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Status</th>
                <th>Location</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.adminJobs.map((job) => `
                <tr>
                  <td><strong>${escapeHtml(job.title)}</strong><br><small>${escapeHtml(job.team || "Project Neura")}</small></td>
                  <td><span class="status-pill ${job.status === "closed" ? "closed" : ""}">${escapeHtml(job.status)}</span></td>
                  <td>${escapeHtml(job.location)}</td>
                  <td>${escapeHtml(formatDate(job.created_at))}</td>
                  <td>
                    <div class="row-actions">
                      <button type="button" data-job-edit="${job.id}">Edit</button>
                      ${job.status !== "open" ? `<button type="button" data-job-status="${job.id}" data-status="open">Open</button>` : ""}
                      ${job.status !== "closed" ? `<button type="button" data-job-status="${job.id}" data-status="closed">Close</button>` : ""}
                      ${job.status !== "draft" ? `<button type="button" data-job-status="${job.id}" data-status="draft">Draft</button>` : ""}
                      <button class="danger" type="button" data-job-delete="${job.id}">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join("") || '<tr><td colspan="5">No jobs yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  container.querySelector("#job-form").addEventListener("submit", handleSaveJob);
  container.querySelector("[data-field-add]").addEventListener("click", addFieldBuilderRow);
  container.querySelectorAll("[data-field-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = button.closest(".field-list");
      button.closest(".field-row").remove();
      updateFieldOrderButtons(list);
    });
  });
  container.querySelectorAll("[data-field-move]").forEach((button) => {
    button.addEventListener("click", () => moveFieldRow(button, button.dataset.fieldMove));
  });
  container.querySelectorAll(".standard-field-row").forEach((row) => {
    syncStandardFieldRequiredState(row);
    row.querySelector('[name="standard_shown"]').addEventListener("change", () => syncStandardFieldRequiredState(row));
  });
  updateFieldOrderButtons(container);
  container.querySelectorAll("[data-job-edit]").forEach((button) => {
    button.addEventListener("click", () => editJob(button.dataset.jobEdit));
  });
  container.querySelector("[data-job-cancel-edit]")?.addEventListener("click", () => {
    state.editingJobId = null;
    renderJobsAdmin();
  });
  container.querySelectorAll("[data-job-status]").forEach((button) => {
    button.addEventListener("click", () => updateJobStatus(button.dataset.jobStatus, button.dataset.status));
  });
  container.querySelectorAll("[data-job-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteJob(button.dataset.jobDelete));
  });
}

function renderFieldBuilderRow(field = {}) {
  const id = field.id || "";
  const label = field.label || "";
  const hint = field.hint || "";
  const type = field.type || "text";
  const options = parseArray(field.options).join(", ");
  return `
    <div class="field-row">
      <label>Label <input name="field_label" value="${escapeHtml(label)}" placeholder="Question"></label>
      <label>Type
        <select name="field_type">
          ${["text", "textarea", "url", "select"].map((item) => `<option value="${item}" ${type === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
      <label>Options <input name="field_options" value="${escapeHtml(options)}" placeholder="For select: Option A, Option B"></label>
      <label>Hint <input name="field_hint" value="${escapeHtml(hint)}" placeholder="Short helper text"></label>
      <label class="checkbox-label field-required"><input name="field_required" type="checkbox" ${field.required ? "checked" : ""}> Required</label>
      <input name="field_id" type="hidden" value="${escapeHtml(id)}">
      <div class="field-order-actions" aria-label="Field order">
        <button type="button" data-field-move="up">Up</button>
        <button type="button" data-field-move="down">Down</button>
      </div>
      <button class="danger field-remove" type="button" data-field-remove>Remove</button>
    </div>
  `;
}

function renderStandardFieldRow(field) {
  const required = field.shown && field.required;
  return `
    <div class="standard-field-row">
      <div>
        <strong>${escapeHtml(field.label)}</strong>
        <p class="muted">${escapeHtml(field.type)}</p>
      </div>
      <label class="checkbox-label"><input name="standard_shown" type="checkbox" data-standard-id="${escapeHtml(field.id)}" ${field.shown ? "checked" : ""}> Show</label>
      <label class="checkbox-label"><input name="standard_required" type="checkbox" data-standard-id="${escapeHtml(field.id)}" ${required ? "checked" : ""} ${field.shown ? "" : "disabled"}> Required</label>
      <div class="field-order-actions" aria-label="Field order">
        <button type="button" data-field-move="up">Up</button>
        <button type="button" data-field-move="down">Down</button>
      </div>
    </div>
  `;
}

function syncStandardFieldRequiredState(row) {
  const shownInput = row.querySelector('[name="standard_shown"]');
  const requiredInput = row.querySelector('[name="standard_required"]');
  requiredInput.disabled = !shownInput.checked;
  if (!shownInput.checked) {
    requiredInput.checked = false;
  }
}

function addFieldBuilderRow() {
  const list = app.querySelector("#field-list");
  list.insertAdjacentHTML("beforeend", renderFieldBuilderRow());
  list.querySelector(".field-row:last-child [data-field-remove]").addEventListener("click", (event) => {
    event.currentTarget.closest(".field-row").remove();
    updateFieldOrderButtons(list);
  });
  list.querySelectorAll(".field-row:last-child [data-field-move]").forEach((button) => {
    button.addEventListener("click", () => moveFieldRow(button, button.dataset.fieldMove));
  });
  updateFieldOrderButtons(list);
}

function moveFieldRow(button, direction) {
  const row = button.closest(".standard-field-row, .field-row");
  const list = row?.parentElement;
  if (!row || !list) return;

  if (direction === "up" && row.previousElementSibling) {
    list.insertBefore(row, row.previousElementSibling);
  }

  if (direction === "down" && row.nextElementSibling) {
    list.insertBefore(row.nextElementSibling, row);
  }

  updateFieldOrderButtons(list);
}

function updateFieldOrderButtons(scope = document) {
  scope ||= document;
  [".standard-field-list", ".field-list"].forEach((selector) => {
    const lists = [
      ...(scope.matches?.(selector) ? [scope] : []),
      ...scope.querySelectorAll(selector)
    ];
    lists.forEach((list) => {
      const rows = [...list.querySelectorAll(".standard-field-row, .field-row")];
      rows.forEach((row, index) => {
        const up = row.querySelector('[data-field-move="up"]');
        const down = row.querySelector('[data-field-move="down"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === rows.length - 1;
      });
    });
  });
}

function slugifyFieldId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function collectJobPayload(form) {
  const data = new FormData(form);
  const standardFields = [...form.querySelectorAll(".standard-field-row")].map((row) => {
    const shownInput = row.querySelector('[name="standard_shown"]');
    const requiredInput = row.querySelector('[name="standard_required"]');
    return {
      id: shownInput.dataset.standardId,
      shown: shownInput.checked,
      required: shownInput.checked && requiredInput.checked
    };
  });
  const formFields = [...form.querySelectorAll(".field-row")]
    .map((row, index) => {
      const label = row.querySelector('[name="field_label"]').value.trim();
      if (!label) return null;
      const type = row.querySelector('[name="field_type"]').value;
      const id = row.querySelector('[name="field_id"]').value || slugifyFieldId(label) || `field_${index + 1}`;
      const options = row.querySelector('[name="field_options"]').value
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean);
      return {
        id,
        label,
        hint: row.querySelector('[name="field_hint"]').value.trim(),
        type,
        required: row.querySelector('[name="field_required"]').checked,
        options
      };
    })
    .filter(Boolean);

  return {
    title: data.get("title"),
    team: data.get("team"),
    location: data.get("location"),
    employment_type: data.get("employment_type"),
    salary: data.get("salary"),
    summary: data.get("summary"),
    description: data.get("description"),
    requirements: data.get("requirements"),
    status: data.get("status"),
    standard_fields: standardFields,
    form_fields: formFields
  };
}

async function handleSaveJob(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const notice = form.querySelector("#job-form-notice");
  const payload = collectJobPayload(form);
  const editingId = state.editingJobId;
  try {
    await request(editingId ? `/api/admin/jobs/${encodeURIComponent(editingId)}` : "/api/admin/jobs", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    state.editingJobId = null;
    notice.innerHTML = `<p class="notice">Job post ${editingId ? "updated" : "created"}.</p>`;
    await loadAdminData();
    renderJobsAdmin();
  } catch (error) {
    notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
  }
}

function editJob(id) {
  state.editingJobId = id;
  renderJobsAdmin();
  app.querySelector("#job-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateJobStatus(id, status) {
  await request(`/api/admin/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  await loadAdminData();
  renderJobsAdmin();
}

async function deleteJob(id) {
  const confirmed = window.confirm("Delete this job post and its applications?");
  if (!confirmed) return;
  await request(`/api/admin/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadAdminData();
  renderJobsAdmin();
}

function renderApplicationsAdmin() {
  const container = app.querySelector("#admin-content");
  const jobsById = new Map(state.adminJobs.map((job) => [job.id, job]));
  const byJob = state.applicationJobId === "all"
    ? state.applications
    : state.applications.filter((application) => application.job_id === state.applicationJobId);
  const byStatus = state.applicationStatusFilter === "all"
    ? byJob
    : byJob.filter((application) => application.status === state.applicationStatusFilter);
  const filtered = byStatus.filter(matchesApplicationEmailFilter);
  const selectedApplications = state.applications.filter((application) => state.selectedApplicationIds.has(application.id));
  const selectedVisibleCount = filtered.filter((application) => state.selectedApplicationIds.has(application.id)).length;
  const selectedCount = state.selectedApplicationIds.size;
  const selectedUnderReviewCount = selectedApplications.filter((application) => application.status === "under_review").length;
  const selectedInvitedCount = selectedApplications.filter((application) => application.status === "invited").length;
  const selectedAdmittedCount = selectedApplications.filter((application) => application.status === "admitted").length;
  const selectedRejectedCount = selectedApplications.filter((application) => application.status === "rejected").length;
  const selectedCanSendInvitation = selectedApplications.length > 0 && selectedApplications.every((application) => canSendApplicationEmail(application, "invited"));
  const selectedCanSendAdmission = selectedApplications.length > 0 && selectedApplications.every((application) => canSendApplicationEmail(application, "admitted"));
  const selectedCanSendRejection = selectedApplications.length > 0 && selectedApplications.every((application) => canSendApplicationEmail(application, "rejected"));
  const selectedInvitationSentCount = selectedApplications.filter(hasInvitationSent).length;
  const selectedDecisionSentCount = selectedApplications.filter(hasDecisionSent).length;
  const emailBlocked = selectedCount > 0 && !selectedCanSendInvitation && !selectedCanSendAdmission && !selectedCanSendRejection;
  const selectionSummary = selectedCount
    ? `${selectedUnderReviewCount} under review, ${selectedInvitedCount} invited, ${selectedAdmittedCount} admitted, ${selectedRejectedCount} rejected · ${selectedInvitationSentCount} invitation sent, ${selectedDecisionSentCount} decision sent`
    : "No applicants selected";
  container.innerHTML = `
    <div class="panel">
      <div class="panel-toolbar">
        <h2>Applications</h2>
        <div class="application-filters">
          <label>
            Job
            <select id="application-filter">
              <option value="all">All jobs</option>
              ${state.adminJobs.map((job) => `<option value="${escapeHtml(job.id)}" ${state.applicationJobId === job.id ? "selected" : ""}>${escapeHtml(job.title)}</option>`).join("")}
            </select>
          </label>
          <label>
            Status
            <select id="application-status-filter">
              <option value="all">All statuses</option>
              ${applicationStatusOptions.map((status) => `<option value="${status.value}" ${state.applicationStatusFilter === status.value ? "selected" : ""}>${status.label}</option>`).join("")}
            </select>
          </label>
          <label>
            Email
            <select id="application-email-filter">
              ${applicationEmailFilterOptions.map((option) => `<option value="${option.value}" ${state.applicationEmailFilter === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      ${state.applicationNotice ? `<div class="notice ${state.applicationNotice.type === "error" ? "error" : ""}"><p>${escapeHtml(state.applicationNotice.message)}</p></div>` : ""}
      <div class="bulk-bar">
        <label class="checkbox-label">
          <input id="application-select-all" type="checkbox" ${filtered.length && selectedVisibleCount === filtered.length ? "checked" : ""}>
          Select visible
        </label>
        <span class="muted">${selectedCount} selected · ${escapeHtml(selectionSummary)}</span>
        <div class="row-actions">
          <button type="button" data-batch-email="invited" ${selectedCanSendInvitation ? "" : "disabled"}>Send invitation</button>
          <button type="button" data-batch-email="admitted" ${selectedCanSendAdmission ? "" : "disabled"}>Send admission</button>
          <button class="danger" type="button" data-batch-email="rejected" ${selectedCanSendRejection ? "" : "disabled"}>Send rejection</button>
          <button type="button" data-clear-selection ${selectedCount ? "" : "disabled"}>Clear</button>
        </div>
        ${emailBlocked ? `<p class="mistake-guard">Email actions only notify applicants already marked with the matching status and not already sent that email. Filter by status and email state before selecting applicants.</p>` : ""}
      </div>
      <div class="application-list">
        ${filtered.map((application) => {
          const job = jobsById.get(application.job_id);
          return `
            <article class="application-card">
              <div class="panel-toolbar">
                <div>
                  <h3>${escapeHtml(application.full_name)}</h3>
                  <p>${escapeHtml(job?.title || "Deleted job")} • ${escapeHtml(formatDate(application.created_at))}</p>
                </div>
                <div class="application-card-actions">
                  <label class="checkbox-label">
                    <input type="checkbox" data-application-select="${escapeHtml(application.id)}" ${state.selectedApplicationIds.has(application.id) ? "checked" : ""}>
                    Select
                  </label>
                  <label class="application-status-control">
                    <span>Status</span>
                    <select data-application-status="${escapeHtml(application.id)}">
                      ${applicationStatusOptions.map((status) => `<option value="${status.value}" ${application.status === status.value ? "selected" : ""}>${status.label}</option>`).join("")}
                    </select>
                  </label>
                  <span class="status-pill ${applicationStatusClass(application.status)}">${escapeHtml(formatApplicationStatus(application.status))}</span>
                  ${hasInvitationSent(application) ? `<span class="status-pill email-sent">Invitation sent</span>` : ""}
                  ${hasDecisionSent(application) ? `<span class="status-pill email-sent">Decision sent</span>` : ""}
                </div>
              </div>
              <div class="inline-list">
                <span>${escapeHtml(application.email)}</span>
                ${application.phone ? `<span>${escapeHtml(application.phone)}</span>` : ""}
                ${application.location ? `<span>${escapeHtml(application.location)}</span>` : ""}
              </div>
              ${application.lookup_code ? `<div class="lookup-code">${escapeHtml(application.lookup_code)}</div>` : ""}
              ${application.resume_url ? `<p><strong>Resume:</strong> <a href="${escapeHtml(application.resume_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.resume_url)}</a></p>` : ""}
              ${application.portfolio_url ? `<p><strong>Portfolio:</strong> <a href="${escapeHtml(application.portfolio_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.portfolio_url)}</a></p>` : ""}
              ${application.linkedin_url ? `<p><strong>LinkedIn:</strong> <a href="${escapeHtml(application.linkedin_url)}" target="_blank" rel="noreferrer">${escapeHtml(application.linkedin_url)}</a></p>` : ""}
              ${application.work_authorization ? `<p><strong>Work authorization:</strong> ${escapeHtml(application.work_authorization)}</p>` : ""}
              ${renderCustomAnswers(application.custom_answers)}
              <p class="prose">${nl2br(application.cover_letter)}</p>
            </article>
          `;
        }).join("") || '<div class="empty">No applications yet.</div>'}
      </div>
    </div>
  `;
  container.querySelector("#application-filter").addEventListener("change", (event) => {
    state.applicationJobId = event.target.value;
    state.applicationNotice = null;
    renderApplicationsAdmin();
  });
  container.querySelector("#application-status-filter").addEventListener("change", (event) => {
    state.applicationStatusFilter = event.target.value;
    state.applicationNotice = null;
    renderApplicationsAdmin();
  });
  container.querySelector("#application-email-filter").addEventListener("change", (event) => {
    state.applicationEmailFilter = event.target.value;
    state.applicationNotice = null;
    renderApplicationsAdmin();
  });
  const selectAll = container.querySelector("#application-select-all");
  if (selectAll) {
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filtered.length;
    selectAll.addEventListener("change", () => {
      filtered.forEach((application) => {
        if (selectAll.checked) {
          state.selectedApplicationIds.add(application.id);
        } else {
          state.selectedApplicationIds.delete(application.id);
        }
      });
      state.applicationNotice = null;
      renderApplicationsAdmin();
    });
  }
  container.querySelectorAll("[data-application-select]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        state.selectedApplicationIds.add(input.dataset.applicationSelect);
      } else {
        state.selectedApplicationIds.delete(input.dataset.applicationSelect);
      }
      state.applicationNotice = null;
      renderApplicationsAdmin();
    });
  });
  container.querySelectorAll("[data-application-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const application = state.applications.find((item) => item.id === select.dataset.applicationStatus);
      const changingFinalDecision = ["admitted", "rejected"].includes(application?.status) && select.value !== application.status;
      if (changingFinalDecision) {
        const confirmed = window.confirm(`${application.full_name} is currently ${formatApplicationStatus(application.status)}. Mark this applicant as ${formatApplicationStatus(select.value)} anyway? This does not send an email.`);
        if (!confirmed) {
          select.value = application.status;
          return;
        }
      }
      updateApplicationStatus(select.dataset.applicationStatus, select.value);
    });
  });
  container.querySelectorAll("[data-batch-email]").forEach((button) => {
    button.addEventListener("click", () => sendBatchDecisionEmails(button.dataset.batchEmail));
  });
  container.querySelector("[data-clear-selection]")?.addEventListener("click", () => {
    state.selectedApplicationIds.clear();
    state.applicationNotice = null;
    renderApplicationsAdmin();
  });
}

async function updateApplicationStatus(id, status) {
  try {
    await request(`/api/admin/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    const application = state.applications.find((item) => item.id === id);
    if (application) {
      application.status = status;
    }
    state.applicationNotice = { type: "success", message: `Marked applicant as ${formatApplicationStatus(status)}.` };
  } catch (error) {
    state.applicationNotice = { type: "error", message: error.message };
  }
  renderApplicationsAdmin();
}

async function sendBatchDecisionEmails(decision) {
  const ids = [...state.selectedApplicationIds];
  const label = formatApplicationStatus(decision);
  const actionLabel = batchEmailActionLabel(decision);
  const selectedApplications = state.applications.filter((application) => state.selectedApplicationIds.has(application.id));
  const mismatchedSelections = selectedApplications.filter((application) => application.status !== decision);
  const alreadySentSelections = selectedApplications.filter((application) => {
    if (decision === "invited") return hasInvitationSent(application);
    return hasDecisionSent(application);
  });

  if (!ids.length) {
    state.applicationNotice = { type: "error", message: "Select at least one applicant." };
    renderApplicationsAdmin();
    return;
  }

  if (mismatchedSelections.length) {
    state.applicationNotice = {
      type: "error",
      message: `${label} emails are blocked because ${mismatchedSelections.length} selected applicant${mismatchedSelections.length === 1 ? " is" : "s are"} not marked ${label.toLowerCase()}. Clear applicants with other statuses from the selection first.`
    };
    renderApplicationsAdmin();
    return;
  }

  if (alreadySentSelections.length) {
    state.applicationNotice = {
      type: "error",
      message: `${label} emails are blocked because ${alreadySentSelections.length} selected applicant${alreadySentSelections.length === 1 ? " has" : "s have"} already been sent this email. Filter for unsent applicants before selecting.`
    };
    renderApplicationsAdmin();
    return;
  }

  const confirmationWord = {
    invited: "INVITE",
    admitted: "ADMIT",
    rejected: "REJECT"
  }[decision];
  const typed = window.prompt(`Type ${confirmationWord} to send ${actionLabel} emails to ${ids.length} selected applicant${ids.length === 1 ? "" : "s"} already marked ${label}.`);
  if (typed !== confirmationWord) {
    state.applicationNotice = { type: "error", message: `Batch ${actionLabel} email cancelled.` };
    renderApplicationsAdmin();
    return;
  }

  state.applicationNotice = { type: "success", message: `Sending ${actionLabel} emails...` };
  renderApplicationsAdmin();

  try {
    const result = await request("/api/admin/applications/batch-email", {
      method: "POST",
      body: JSON.stringify({ ids, decision })
    });
    const failedIds = new Set(result.failed.map((item) => item.id).filter(Boolean));
    state.selectedApplicationIds = failedIds;
    await loadAdminData();
    const failedText = result.failed.length ? ` ${result.failed.length} failed and remain selected.` : "";
    state.applicationNotice = {
      type: result.failed.length ? "error" : "success",
      message: `Sent ${result.sent.length} ${actionLabel} email${result.sent.length === 1 ? "" : "s"}.${failedText}`
    };
  } catch (error) {
    state.applicationNotice = { type: "error", message: error.message };
  }

  renderApplicationsAdmin();
}

async function renderEmailAdmin() {
  const container = app.querySelector("#admin-content");
  container.innerHTML = `
    <div class="panel">
      <div class="panel-toolbar">
        <div>
          <h2>Email templates</h2>
          <p class="muted">Subject and body templates used for applicant messages.</p>
        </div>
      </div>
      <div id="email-template-notice"></div>
      <div id="email-templates">Loading templates...</div>
    </div>
  `;

  const templateNotice = container.querySelector("#email-template-notice");
  const templatesContainer = container.querySelector("#email-templates");

  try {
    const { templates, variables } = await request("/api/admin/email-templates");
    state.emailTemplates = templates;
    state.emailTemplateVariables = variables;
    templatesContainer.innerHTML = renderEmailTemplatesEditor(templates, variables);
    templatesContainer.querySelectorAll("[data-template-form]").forEach((templateForm) => {
      templateForm.addEventListener("submit", (event) => saveEmailTemplate(event, templateNotice));
    });
    templatesContainer.querySelectorAll("[data-template-defaults]").forEach((button) => {
      button.addEventListener("click", () => {
        const template = state.emailTemplates.find((item) => item.key === button.dataset.templateDefaults);
        const templateForm = button.closest("form");
        if (!template) return;
        templateForm.elements.subject.value = template.default_subject;
        templateForm.elements.body.value = template.default_body;
      });
    });
  } catch (error) {
    templatesContainer.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
  }
}

function renderEmailTemplatesEditor(templates, variables) {
  const variableChips = variables.map((variable) => `<code>{{${escapeHtml(variable)}}}</code>`).join("");
  return `
    <div class="variable-strip" aria-label="Available template fields">${variableChips}</div>
    <div class="template-list">
      ${templates.map((template) => `
        <form class="template-editor" data-template-form="${escapeHtml(template.key)}">
          <div class="panel-toolbar">
            <h3>${escapeHtml(template.label)}</h3>
            <button class="ghost" type="button" data-template-defaults="${escapeHtml(template.key)}">Restore default</button>
          </div>
          <label>Subject <input name="subject" value="${escapeHtml(template.subject)}" required maxlength="200"></label>
          <label>Body <textarea name="body" required>${escapeHtml(template.body)}</textarea></label>
          <input type="hidden" name="key" value="${escapeHtml(template.key)}">
          <div class="form-actions">
            <button class="primary" type="submit">Save template</button>
          </div>
        </form>
      `).join("")}
    </div>
  `;
}

async function saveEmailTemplate(event, notice) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const payload = {
    key: form.elements.key.value,
    subject: form.elements.subject.value,
    body: form.elements.body.value
  };
  button.disabled = true;
  notice.innerHTML = "";
  try {
    const { templates } = await request("/api/admin/email-templates", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    state.emailTemplates = templates;
    notice.innerHTML = `<p class="notice">Template saved.</p>`;
  } catch (error) {
    notice.innerHTML = `<p class="notice error">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
  }
}

async function render() {
  setActiveNav();
  app.focus({ preventScroll: true });
  const path = location.pathname.replace(/\/+$/, "") || "/";
  try {
    if (path === "/") {
      await renderHome();
    } else if (path.startsWith("/jobs/")) {
      await renderJob(decodeURIComponent(path.split("/").pop()));
    } else if (path === "/check") {
      renderCheck();
    } else if (path === "/admin") {
      await renderAdmin();
    } else {
      app.innerHTML = `
        <section class="page">
          <div class="empty">Page not found. <a href="/" data-link>Return to jobs</a>.</div>
        </section>
      `;
    }
  } catch (error) {
    renderError(error);
  }
  setActiveNav();
}

render();
