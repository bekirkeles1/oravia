# Local Demo Runbook

This runbook covers local admin dashboard demo tools and appointment agent demos only. It does not include WhatsApp, CRM, or production setup.

Oravia is a Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard. The patient-facing experience belongs in a messaging channel such as WhatsApp or future chat channels. The dashboard is only for clinic staff operations, monitoring, configuration, handoff visibility, and admin demo tools.

The current dashboard includes a local role switcher prototype for Doctor, Secretary, and Admin / Owner views. The Secretary screen includes manual phone appointment entry for internal clinic operations. When `ORAVIA_AUTH_REQUIRED=true` is set, internal workspace and operational API routes require the server-side auth session described below.

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

## Local Authentication

Local auth is intentionally server controlled. It uses local credentials only,
stores password hashes with unique salts, stores opaque session token hashes in
SQLite, and places the raw session token only in an `HttpOnly` cookie.

Enable auth with SQLite-backed local storage:

```bash
ORAVIA_AUTH_REQUIRED=true
ORAVIA_STORAGE_MODE=sqlite
ORAVIA_SQLITE_DATABASE_PATH=./var/oravia-local.sqlite
ORAVIA_CLINIC_ID=oravia_demo_clinic
```

Bootstrap the first manager account locally:

```bash
npm run auth:bootstrap-user -- --username manager --role manager --displayName "Clinic Manager"
```

The CLI prompts for a password and never prints or writes the plaintext password
to the repository. Do not use real clinic staff passwords in local demos.

Roles:

- `manager`: internal reads, operational mutations, auth management.
- `secretary`: internal reads and operational mutations for review decisions,
  appointment creation, calendar sync, appointment confirmation dispatch, and
  doctor availability.
- `doctor`: internal reads only.

Cookie-auth state-changing internal routes perform minimal same-origin
validation when an `Origin` header is present. Public inbound messaging remains
public at `POST /api/messaging/inbound`.

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

The dashboard uses local demo data only. It shows the Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard demo clinic, demo doctor, one sample confirmed appointment, the calendar provider label, the role switcher prototype, the `System Status` panel, and an `Admin Demo Tools` section.

## Role Switcher Prototype

The role switcher appears near the top of the dashboard as:

```text
Görünüm: Doktor | Sekreter | Yönetici
```

The default selected role is `Sekreter`.

Use it to switch between local demo views:

- `Doktor`: `Doktor Ekranı` for morning schedule context, including bugünkü randevular, haftalık randevu özeti, hasta notları, tedavi ilgisi, and AI görüşme özeti.
- `Sekreter`: `Sekreter Operasyon Ekranı` for front desk operations, including bugünün operasyon özeti, bekleyen hasta / handoff kuyruğu, telefonla gelen randevu girişi, doktor müsaitlik özeti, and Google Calendar senkron durumu.
- `Yönetici`: `Yönetici Performans Ekranı` for owner metrics, including toplam randevu, AI kaynaklı randevular, telefonla gelen randevular, handoff oranı, doktor doluluk oranı, and dönüşüm göstergeleri.

The compact top summary shows bugünkü randevular, bekleyen devirler / handoff, takvim senkron durumu, and demo modu.

The role switcher is still a local view prototype and does not override the
server-side authenticated user or role. Real permissions are enforced on
server-side internal API routes only when `ORAVIA_AUTH_REQUIRED=true`.

### Secretary Manual Phone Appointment Sync

The Secretary screen can submit the manual phone appointment form to:

```text
POST /api/secretary/manual-appointment/calendar
```

The endpoint validates patient name, Turkish mobile phone, treatment, doctor, date, time, and duration. It maps the internal secretary appointment into a calendar event using the configured calendar provider:

- `CALENDAR_PROVIDER=mock` returns a fake `mock_calendar_event_...` id.
- `CALENDAR_PROVIDER=google_service_account` creates a real event in the configured demo Google Calendar.

The form shows loading, success, and failure states. On success, it adds the appointment to the local timeline and shows the calendar provider and event id. This is still an internal secretary operation; patients do not book through the dashboard.

The `System Status` panel is an informational demo safety panel. It shows that the demo API and mock appointment API are ready, the dashboard is in `Internal operations / Provider aware` mode, Google Calendar CLI flow is available, optional Google Calendar demo events require explicit confirmation, and WhatsApp/database integrations are not connected. It does not perform live monitoring or call external services.

The `Admin Demo Tools` section contains the `Demo Appointment Flow`. This is an admin/demo action that simulates the agent flow; it is not a patient-facing booking surface. It shows the sample message:

```text
Merhaba, implant için randevu almak istiyorum.
```

Click `Run Demo Appointment Flow` to call the internal demo API endpoints:

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

This demo appointment flow does not create real Google Calendar events. It exists to show how the agent would handle a patient message in a messaging channel.

## Optional Google Calendar Dashboard Event

The dashboard includes a clearly separated `Optional Google Calendar Demo Event` admin demo action under Step 5.

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
- is an admin/demo tool, not a patient booking feature

To test it locally:

1. Configure `.env` for the Google service account provider.
2. Run `npm run check:env`.
3. Run `npm run dev`.
4. Open the dashboard.
5. Click `Run Demo Appointment Flow`.
6. Click `Create Google Calendar Demo Event`.
7. Accept the confirmation prompt.
8. Verify the event titled `ORAVIA DEMO - Implant Appointment` in the configured demo calendar.

If the confirmation prompt is cancelled, no real Google Calendar event is created.

## Internal Demo API

Start the local server:

```bash
npm run dev
```

The demo API uses local workflow code. The classify, availability, and appointment endpoints model the AI receptionist agent flow. They use the mock calendar provider only and do not create real Google Calendar events.

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

## Demo Appointment Flow Mock CLI

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
