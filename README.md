# Project Neura Application Portal

A Cloudflare Pages application portal for Project Neura. It includes:

- Public job listing page at `/`
- Per-job application pages at `/jobs/:slug`
- Public application check-back page at `/check`
- Staff admin panel at `/admin`
- Editable per-job application fields managed from the admin panel
- Cloudflare Pages Functions APIs
- Cloudflare D1 storage for jobs and applications

The admin panel intentionally does not include application-level authentication. Put Cloudflare Zero Trust Access in front of `/admin*` and `/api/admin/*`.

Applicants receive a private lookup code after submitting. They can use that code on `/check` to retrieve the application they submitted.
Staff can add role-specific application fields such as text, long-answer, URL, and select questions when creating or editing a job post.
When SMTP secrets are configured, applicants also receive a confirmation email with their check-back code after submitting.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local D1 database and apply migrations:

   ```bash
   npx wrangler d1 create projectneura-join
   npm run db:migrate:local
   npx wrangler d1 execute projectneura-join --local --file seed.sql
   ```

3. Start Pages dev:

   ```bash
   npm run dev
   ```

The app will be available at the URL printed by Wrangler, usually `http://localhost:8788`.

## Cloudflare setup

1. Create a D1 database:

   ```bash
   npx wrangler d1 create projectneura-join
   ```

2. Copy the generated `database_id` into `wrangler.toml`.

3. Apply the remote migration:

   ```bash
   npm run db:migrate:remote
   ```

4. Deploy to Cloudflare Pages:

   ```bash
   npm run deploy
   ```

5. In Cloudflare Zero Trust Access, create an application or policy that protects:

   ```text
   https://<your-domain>/admin*
   https://<your-domain>/api/admin/*
   ```

Public visitors only need access to `/`, `/jobs/:slug`, `/check`, `/api/jobs`, and `/api/applications`.

## Email confirmation

The application sends applicant confirmation emails through SMTP when these secrets are available to the Pages Functions runtime:

```text
SMTP_HOST=shadow.mxrouting.net
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_USERNAME=join@projectneura.org
SMTP_PASSWORD=<set as a secret>
SMTP_FROM=Project Neura <join@projectneura.org>
SMTP_REPLY_TO=join@projectneura.org
```

In Cloudflare Pages, add these under Settings > Variables and Secrets and encrypt `SMTP_PASSWORD`. For local development, put them in `.dev.vars`; do not commit that file.

Use port `587` with `SMTP_SECURE=starttls` by default. Cloudflare Workers TCP sockets cannot connect to SMTP port `25`.
