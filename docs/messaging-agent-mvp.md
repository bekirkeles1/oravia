# Oravia Messaging Agent MVP Notes

## Product direction

Oravia patients should not book appointments from the dashboard.

The patient-facing flow is WhatsApp / messaging first. Patients will talk to the AI Agent through a messaging channel.

The dashboard is internal-only and is for clinic operations:
- Doctor
- Secretary
- Manager / Admin

## Current messaging status

The current messaging-agent foundation is intentionally small.

Implemented:
- Pure inbound handler: src/api/messagingInboundHandler.js
- Next.js API bridge: POST /api/messaging/inbound
- Route file: app/api/messaging/inbound/route.js
- Demo script: npm run demo:messaging-inbound
- Local intent classifier reuse
- Payload validation
- Unknown intent handoff response
- Controlled appointment confirmation dispatch for trusted in-memory
  appointments only
- Safe mock outbound appointment confirmation provider

Current valid sample payload:

{
  "channel": "whatsapp",
  "from": "+905322223333",
  "message": "İmplant için randevu almak istiyorum",
  "timestamp": "2026-07-06T15:30:00+03:00"
}

Expected current response shape:

{
  "status": "received",
  "channel": "whatsapp",
  "from": "+905322223333",
  "intent": "appointment_request",
  "requires_handoff": false,
  "reply_draft": "İmplant randevusu için uygun saatleri kontrol ediyorum."
}

## Current boundaries

The current messaging inbound flow does not:

- Connect to a real WhatsApp provider
- Verify a WhatsApp webhook signature
- Send outbound WhatsApp messages
- Store messages in a database
- Use authentication
- Create appointments
- Sync appointments to calendar providers
- Touch secretary manual appointment flow
- Use real patient data

Milestone 15 adds a controlled outbound confirmation path for appointments that
already exist in trusted server-side in-memory state. The client may request the
dispatch only with `expectedAppointmentVersion`, `idempotencyKey`, and the
explicit `send_mock_appointment_confirmation` confirmation string. Recipient,
destination, provider, appointment fields, and message body are constructed on
the server from trusted appointment state. The default provider is a safe mock
provider: it records an immutable local dispatch receipt and never claims real
patient delivery, WhatsApp delivery, email delivery, SMS delivery, durable
persistence, database persistence, or calendar writes.

This is deliberate. The current goal is only to prove that an inbound messaging payload can enter the system, be validated, classified, and return a safe reply draft.

## Durable single-clinic storage

Oravia supports two server-controlled local storage modes:

- `in_memory`: the default isolated mock mode used by focused tests and safe
  demos.
- `sqlite`: a durable local single-clinic mode backed by Node's built-in
  `node:sqlite` module.

SQLite mode is selected only on the server with environment/configuration:

```bash
ORAVIA_STORAGE_MODE=sqlite
ORAVIA_SQLITE_DATABASE_PATH=./var/oravia-local.sqlite
ORAVIA_CLINIC_ID=oravia_demo_clinic
npm run dev
```

Clients cannot select storage mode, database path, or clinic id through route
bodies, headers, or workspace controls. If SQLite is configured but the
database path or schema initialization fails, the runtime fails safely; it does
not silently fall back to in-memory success.

The current durable scope is intentionally single-clinic. Durable records are
scoped by the configured `clinic_id`, which prepares the repository layer for a
future multi-clinic adapter without adding clinic switching, signup, billing,
tenant administration, or multi-tenant UI behavior.

Startup migrations are explicit SQL migrations recorded in
`schema_migrations`. They are idempotent and run only when the server runtime
initializes SQLite; importing modules or building the app does not create or
mutate a database. There is no destructive automatic reset and no migration
framework dependency.

SQLite database artifacts are local runtime files and are ignored by Git:
`*.sqlite`, `*.sqlite3`, `*.db`, journal, WAL, SHM files, and `var/`. Do not use
SQLite mode as a production-scale database or backup strategy yet. A future
PostgreSQL adapter should reuse the same repository/runtime boundaries rather
than changing route or client contracts.

## Local internal authentication

Internal workspace authentication is controlled by the server with:

```bash
ORAVIA_AUTH_REQUIRED=true
ORAVIA_STORAGE_MODE=sqlite
ORAVIA_SQLITE_DATABASE_PATH=./var/oravia-local.sqlite
ORAVIA_CLINIC_ID=oravia_demo_clinic
```

Auth users and sessions live in the local SQLite schema. Passwords are hashed
with per-user salts, and sessions are resolved from an opaque `HttpOnly` cookie
whose raw token is never stored in the database. Bootstrap the first local
manager with:

```bash
npm run auth:bootstrap-user -- --username manager --role manager
```

Client payloads cannot select clinic, role, user, provider, appointment trusted
fields, message body, or recipient. Internal API routes resolve those values
from server state and return `401` for unauthenticated requests or `403` for
roles without permission. Doctor accounts are read-only. The public inbound
messaging route remains unauthenticated so external messaging intake can be
connected at its own provider boundary later.

## Safety rules

Never commit:
- .env
- credentials.json
- token.json
- service-account.json
- oravia-secrets
- Google private key content
- Real patient data

Demo payloads must use fake patient data only.

Real Google Calendar tests must be explicit and manually cleaned after use.

For mock appointment demo runs, use:

CALENDAR_PROVIDER=mock npm run demo:appointment

Do not mistype CALENDAR_PROVIDER. A typo can accidentally fall back to the .env provider and create a real Google Calendar event.

## Demo commands

Run messaging inbound demo:

npm run demo:messaging-inbound

Run all tests:

npm test

Run environment safety check:

npm run check:env

Run appointment demo in mock mode:

CALENDAR_PROVIDER=mock npm run demo:appointment

## Next likely sprint

Sprint 10E should define the next messaging-agent step before connecting a real WhatsApp provider.

Recommended next scope:
- Conversation state planning
- Handoff rules
- Message direction model: inbound vs outbound
- What patient data can be stored later
- What data must remain demo-only for now

Do not connect real WhatsApp until these boundaries are clear.
