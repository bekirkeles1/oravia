# Oravia Pilot Deployment Runbook

This runbook covers the single-node pilot deployment model. It is not a high
availability design and does not claim production certification.

## Runtime Model

- Run one writable Oravia application container.
- Use SQLite at `ORAVIA_SQLITE_DATABASE_PATH` on one persistent data volume.
- Terminate HTTPS at the hosting platform or reverse proxy.
- Do not run multiple writable app instances against the same SQLite database.
- Do not add Redis, a worker, a queue, or a separate database server for the
  pilot.

Future scale-out should introduce a shared database adapter, for example
PostgreSQL, before horizontal application replicas are enabled.

## Required Production Environment

Set values in an environment file managed outside Git.

```text
NODE_ENV=production
ORAVIA_RUNTIME_ENV=production
ORAVIA_PUBLIC_BASE_URL=
ORAVIA_TRUSTED_ORIGIN=
ORAVIA_AUTH_REQUIRED=true
ORAVIA_SESSION_COOKIE_SECURE=true
ORAVIA_SESSION_SECRET=
ORAVIA_STORAGE_MODE=sqlite
ORAVIA_SQLITE_DATABASE_PATH=/data/oravia.sqlite
ORAVIA_CLINIC_ID=
ORAVIA_WHATSAPP_CHANNEL_IDENTITY_KEY=
ORAVIA_WHATSAPP_PROVIDER_MODE=mock
```

Optional provider configuration remains server-side:

```text
ORAVIA_WHATSAPP_PROVIDER_MODE=meta_cloud
ORAVIA_WHATSAPP_GRAPH_API_VERSION=
ORAVIA_WHATSAPP_PHONE_NUMBER_ID=
ORAVIA_WHATSAPP_WABA_ID=
ORAVIA_WHATSAPP_ACCESS_TOKEN=
ORAVIA_WHATSAPP_APP_SECRET=
ORAVIA_WHATSAPP_WEBHOOK_VERIFY_TOKEN=
ORAVIA_WHATSAPP_APPOINTMENT_TEMPLATE_NAME=
ORAVIA_WHATSAPP_TEMPLATE_LANGUAGE=
ORAVIA_WHATSAPP_AUTO_REPLY_MODE=disabled
CALENDAR_PROVIDER=mock
```

Do not commit `.env`, credentials, tokens, private keys, SQLite files, backups,
logs, or volume data.

## Trusted Origin and HTTPS

`ORAVIA_PUBLIC_BASE_URL` and `ORAVIA_TRUSTED_ORIGIN` must be HTTPS URLs in
production. State-changing internal routes require a trusted browser origin.
Reverse proxy headers are trusted only when `ORAVIA_TRUST_PROXY_HEADERS=true`;
then `X-Forwarded-Host` must match the trusted host and `X-Forwarded-Proto` must
be `https`.

Webhook signature validation is independent of sessions and cookies.

## Container Build and Run

Build:

```bash
docker build -t oravia-pilot:local .
```

Run with an external env file:

```bash
docker compose -f docker-compose.pilot.yml up --build
```

The image uses a multi-stage Next.js standalone build, a non-root `oravia` user,
port `3000`, and a writable `/data` volume.

## Health Endpoints

- `GET /api/health/live` proves only that the process is alive.
- `GET /api/health/ready` verifies runtime config, SQLite open/migrations, and
  configured clinic row. It does not call Meta or Google.

Responses expose safe booleans and schema version only; no secrets, raw DB path,
patient data, SQL, stack trace, or provider credentials.

## Startup and Shutdown

`npm start` runs `scripts/start-production.js`. Startup validates production
config, opens SQLite at runtime, applies migrations through the existing
boundary, writes a server lock file beside the DB, then starts Next standalone.
SIGTERM/SIGINT are forwarded to the server and the lock file is removed on exit.

## SQLite Durability

SQLite is configured with:

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA synchronous = NORMAL`
- `PRAGMA busy_timeout = 5000`

WAL/SHM/journal artifacts must remain in the configured data volume and are
ignored by Git. Use one writable instance. Schedule platform-level backups or a
cron outside the app; a daily backup is a practical starting point for a pilot.

## Backup

Create a backup:

```bash
npm run db:backup -- --output /safe/backup/oravia.sqlite
```

If `--output` is omitted, the backup is generated inside
`ORAVIA_SQLITE_BACKUP_DIR` or a `backups` directory beside the configured DB.
Existing files are not overwritten unless `--overwrite` is passed. The command
prints only a safe filename and status.

## Restore

Validate intent first:

```bash
npm run db:restore -- --input /safe/backup/oravia.sqlite
```

Actual restore requires:

```bash
npm run db:restore -- --input /safe/backup/oravia.sqlite --confirm
```

Restore validates the SQLite file and expected schema version, refuses an active
server lock unless explicitly overridden for controlled maintenance, creates a
safety backup before replacement, and never prints backup contents.

## Rollback and Restart

1. Stop the application container.
2. Confirm the health endpoint is no longer serving traffic.
3. Restore a validated backup with `--confirm`.
4. Start the application container.
5. Verify `/api/health/ready`, login, protected workspace, and webhook verify.

## Logs

Operational logs are structured JSON and server-side only. Log level is
configured with `ORAVIA_LOG_LEVEL`. Sensitive keys and patient-like identifiers
are redacted: tokens, secrets, passwords, cookies, raw messages, phone numbers,
channel identities, SQL, DB paths, and stack traces.

## Manager Operations Status

Managers can view safe deployment status in the dashboard and
`GET /api/operations/status`: environment, storage mode, DB readiness, schema
state, backup readiness, provider mode/completeness, webhook readiness, secure
cookie state, and trusted-origin state. It does not expose secrets or raw paths.

## Meta Activation Checklist

- Deploy over public HTTPS.
- Configure callback URL: `/api/webhooks/whatsapp`.
- Set the webhook verify token in Meta and server env.
- Keep app-secret signature validation enabled.
- Subscribe WhatsApp message and status webhook fields.
- Map the business phone-number ID.
- Use only a designated synthetic test recipient during activation.
- Configure an approved appointment-confirmation utility template.
- Set a configured Graph API version.
- Rotate access tokens through the hosting secret manager.

Optional real Meta smoke runs only with `WHATSAPP_REAL_SMOKE=1`.

## Optional Real Deployment

Real deployment is run only when `ORAVIA_REAL_DEPLOY=1` and preexisting hosting
credentials are configured. Do not create paid infrastructure from this repo
without explicit external configuration. Without credentials, report:

```text
Real deployment: not run — hosting credentials intentionally absent
```
