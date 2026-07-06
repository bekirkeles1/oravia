# Local Demo Runbook

This runbook covers the local dashboard and appointment demos only. It does not include WhatsApp, database, authentication, CRM, or production setup.

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

The dashboard uses local demo data only. It shows the Oravia Dental Receptionist demo clinic, demo doctor, one sample confirmed appointment, the calendar provider label, the `System Status` panel, and an `End-to-End Demo` section.

The `System Status` panel is an informational demo safety panel. It shows that the demo API and mock appointment API are ready, the dashboard is in `Demo API / Mock only` mode, Google Calendar CLI flow is available, real calendar events from the dashboard require explicit confirmation, and WhatsApp/database integrations are not connected. It does not perform live monitoring or call external services.

The `End-to-End Demo` section shows the sample message:

```text
Merhaba, implant için randevu almak istiyorum.
```

Click `Run End-to-End Demo` to call the internal demo API endpoints:

- `POST /api/demo/classify`
- `POST /api/demo/availability`
- `POST /api/demo/appointment`

The dashboard then displays:

- patient message
- detected intent
- confidence
- treatment interest
- requires handoff
- AI reply
- suggested mock available slots
- selected slot
- mock appointment status
- mock `calendar_event_id`
- `calendar_provider: mock`

This mock end-to-end demo does not create real Google Calendar events.

## Optional Google Calendar Dashboard Event

The dashboard includes a clearly separated `Create Google Calendar Demo Event` button under Step 5.

Warning:

```text
Google Calendar demo event creates a real event in the configured demo calendar.
```

This button:

- does not run automatically
- asks for explicit browser confirmation before calling the API
- requires the API payload field `confirm_real_calendar_event: true`
- uses only demo data
- never uses real patient data
- creates a real event titled `ORAVIA DEMO - Implant Appointment`

To test it locally:

1. Configure `.env` for the Google service account provider.
2. Run `npm run check:env`.
3. Run `npm run dev`.
4. Open the dashboard.
5. Click `Run End-to-End Demo`.
6. Click `Create Google Calendar Demo Event`.
7. Accept the confirmation prompt.
8. Verify the event titled `ORAVIA DEMO - Implant Appointment` in the configured demo calendar.

If the confirmation prompt is cancelled, no real Google Calendar event is created.

## Internal Demo API

Start the local server:

```bash
npm run dev
```

The demo API uses local workflow code. The classify, availability, and appointment endpoints use the mock calendar provider only and do not create real Google Calendar events.

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

Create an optional real Google Calendar demo event only after explicit confirmation:

```bash
curl -X POST http://localhost:3000/api/demo/google-calendar-event \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba, implant için randevu almak istiyorum.","confirm_real_calendar_event":true}'
```

Without `confirm_real_calendar_event: true`, this endpoint returns an error and does not create a real event.

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
