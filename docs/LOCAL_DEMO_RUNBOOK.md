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
