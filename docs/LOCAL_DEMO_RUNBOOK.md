# Local Demo Runbook

This runbook covers the local appointment demos only. It does not include WhatsApp, dashboard, database, or production setup.

## Safety Rules

Never commit these files or values:

- `.env`
- service account JSON files
- OAuth tokens or credential files
- private keys
- calendar IDs or credential values from a real clinic environment

Keep service account JSON outside the repository. The `.gitignore` already excludes `.env`.

## Required Environment

For mock calendar demos:

```bash
CALENDAR_PROVIDER=mock
```

For Google Calendar demos, `.env` must include:

```bash
CALENDAR_PROVIDER=google_service_account
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/absolute/path/to/service-account.json
GOOGLE_CALENDAR_ID=your-calendar-id
```

`GOOGLE_SERVICE_ACCOUNT_KEY_PATH` must point to a local JSON key file that exists outside the repo. The Google Calendar must be shared with the service account email with permission to make changes to events.

## Preflight Check

Run this before creating a real Google Calendar appointment:

```bash
npm run check:env
```

The check confirms `.env` was loaded, `CALENDAR_PROVIDER` is set, and Google Calendar settings are present when `CALENDAR_PROVIDER=google_service_account`. It does not print service account JSON contents or secret values.

## Automated Tests

Run:

```bash
npm test
```

Automated tests use mock or fake providers only. They must not create real Google Calendar events.

## Local Dashboard

Run:

```bash
npm run dev
```

Open the localhost URL printed by Next.js, usually:

```text
http://localhost:3000
```

The dashboard uses local demo data only. It shows the Oravia Dental Receptionist demo clinic, demo doctor, one sample confirmed appointment, and the calendar provider label. It also includes a conversation simulator labeled `Demo API mode — no real patient data, no real calendar event`.

The `System Status` panel is an informational demo safety panel. It shows that the demo API and mock appointment API are ready, the dashboard is in `Demo API / Mock only` mode, Google Calendar real event creation is available only through the CLI flow, real calendar events from the dashboard are disabled, and WhatsApp/database integrations are not connected. It does not perform live monitoring or call external services.

The simulator shows the sample message:

```text
Merhaba, implant için randevu almak istiyorum.
```

Click `Run demo simulation` to call the internal demo API endpoints:

- `POST /api/demo/classify`
- `POST /api/demo/availability`

The dashboard then displays the detected intent, confidence, treatment interest, handoff flag, patient message summary, suggested mock available slots, and AI reply.

Click `Create mock appointment` to call:

- `POST /api/demo/appointment`

This creates a mock appointment only. The dashboard simulator uses demo API routes with the mock provider; it does not create real Google Calendar events.

## Internal Demo API

Start the local server:

```bash
npm run dev
```

The demo API uses local workflow code. The appointment endpoint uses the mock calendar provider only and does not create real Google Calendar events.

Classify a patient message:

```bash
curl -X POST http://localhost:3000/api/demo/classify \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, implant için randevu almak istiyorum."}'
```

Get mock availability:

```bash
curl -X POST http://localhost:3000/api/demo/availability \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, implant için randevu almak istiyorum."}'
```

Create a local mock appointment with a dynamically selected offered slot:

```bash
curl -X POST http://localhost:3000/api/demo/appointment \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, implant için randevu almak istiyorum."}'
```

Create a local mock appointment with a specific offered slot:

```bash
curl -X POST http://localhost:3000/api/demo/appointment \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, implant için randevu almak istiyorum.","selected_slot_id":"demo_2026-07-06_1400"}'
```

## Mock Appointment Demo

Run:

```bash
CALENDAR_PROVIDER=mock npm run demo:appointment
```

Expected result:

- `selected_slot` is not `null`
- `appointment` is not `null`
- `appointment.status` is `confirmed`
- `appointment.calendar_provider` is `mock`
- `appointment.calendar_event_id` starts with `mock_calendar_event_`

## Google Calendar Appointment Demo

Run:

```bash
npm run demo:appointment:google
```

Expected result:

- `selected_slot` is not `null`
- `appointment` is not `null`
- `appointment.status` is `confirmed`
- `appointment.created_by` is `ai`
- `appointment.calendar_provider` is `google_service_account`
- `appointment.calendar_event_id` is present

This command creates a real Google Calendar event named `Oravia Appointment - implant`.

## Verify In Google Calendar

Open the calendar configured by `GOOGLE_CALENDAR_ID` and check the selected appointment time from the command output. Confirm that a new event named `Oravia Appointment - implant` exists at that time.

If the command reports:

```text
Share the Google Calendar with the service account email and grant Make changes to events.
```

open Google Calendar settings, share the calendar with the service account `client_email`, and grant `Make changes to events`.
