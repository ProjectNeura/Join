export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("Missing D1 binding named DB");
  }
  return env.DB;
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function required(value, label) {
  const text = normalizeText(value);
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function readJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeFormFields(value) {
  const allowedTypes = new Set(["text", "textarea", "url", "select"]);
  return readJsonArray(value)
    .map((field, index) => {
      const label = normalizeText(field?.label).slice(0, 120);
      if (!label) return null;
      const type = allowedTypes.has(field?.type) ? field.type : "text";
      const fallbackId = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48) || `field_${index + 1}`;
      const id = normalizeText(field?.id)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || fallbackId;
      const options = type === "select"
        ? readJsonArray(field?.options).map(normalizeText).filter(Boolean).slice(0, 12)
        : [];
      return {
        id,
        label,
        type,
        required: Boolean(field?.required),
        options
      };
    })
    .filter(Boolean)
    .filter((field, index, fields) => fields.findIndex((candidate) => candidate.id === field.id) === index)
    .slice(0, 12);
}

export function parseFormFields(value) {
  return normalizeFormFields(readJsonArray(value));
}

export const defaultStandardFields = [
  { id: "phone", label: "Phone", type: "text", shown: true, required: false },
  { id: "location", label: "Location", type: "text", shown: true, required: false },
  { id: "portfolio_url", label: "Portfolio URL", type: "url", shown: true, required: false },
  { id: "linkedin_url", label: "LinkedIn URL", type: "url", shown: true, required: false },
  { id: "resume_url", label: "Resume URL", type: "url", shown: true, required: false },
  { id: "work_authorization", label: "Work authorization", type: "text", shown: true, required: false },
  { id: "cover_letter", label: "Cover letter", type: "textarea", shown: true, required: true }
];

export function normalizeStandardFields(value) {
  const overrides = new Map(readJsonArray(value).map((field) => [field?.id, field]));
  return defaultStandardFields.map((field) => {
    const override = overrides.get(field.id);
    return {
      ...field,
      shown: override?.shown !== undefined ? Boolean(override.shown) : field.shown,
      required: override?.required !== undefined ? Boolean(override.required) : field.required
    };
  });
}

export function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "job";
}

export async function uniqueSlug(db, title) {
  const base = slugify(title);
  let slug = base;
  let index = 2;
  while (true) {
    const existing = await db.prepare("SELECT id FROM jobs WHERE slug = ?").bind(slug).first();
    if (!existing) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function formatLookupCode(rawCode) {
  const clean = rawCode.replace(/^PN/, "").slice(0, 16);
  const groups = clean.match(/.{1,4}/g) || [];
  return `PN-${groups.join("-")}`;
}

export function normalizeLookupCode(value) {
  const raw = normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";
  return formatLookupCode(raw);
}

function generateLookupCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
  return formatLookupCode(raw);
}

export async function uniqueLookupCode(db) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateLookupCode();
    const existing = await db.prepare("SELECT id FROM applications WHERE lookup_code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Could not create an application lookup code");
}

export function workerError(errorValue) {
  const message = errorValue instanceof Error ? errorValue.message : "Unexpected error";
  const status = message.includes("required") ? 422 : 500;
  return error(message, status);
}
