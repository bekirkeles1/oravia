# Appointment Change Lifecycle

Milestone 20 adds a durable local lifecycle for appointment reschedule and
cancellation operations.

## Local Mutation Boundary

- Reschedule and cancellation are local appointment mutations.
- Clients may submit only `expectedAppointmentVersion`, `selectedSlotId` when
  rescheduling, `idempotencyKey`, and the explicit confirmation phrase.
- Doctor, date, duration, provider, destination, message, actor, and clinic
  fields are resolved from trusted server state only.
- Matching idempotency replay returns the stored result before version,
  availability, follow-up-status, or provider checks run.
- Conflicting idempotency replay returns `idempotency_key_conflict` and does not
  mutate the appointment.

## Follow-Up Boundary

Calendar updates, calendar cancellations, reschedule notifications, and
cancellation notifications are separate explicit operations. Local appointment
changes never call Google Calendar, Meta WhatsApp, or any other provider by
themselves.

Each provider follow-up uses its own operation-specific idempotency store. A
matching replay returns the previously stored result and reports
`providerCalled: false`, so a second external side effect is not produced.

## Durable State

SQLite stores current appointment state and immutable lifecycle events in
`appointment_lifecycle_events`. Restarting the runtime preserves:

- appointment status and version,
- calendar and notification follow-up status,
- lifecycle event history,
- operation idempotency when the SQLite idempotency store is used by the runtime.

Cancelled appointments release their former slot for future trusted server
availability calculations. Rescheduled appointments release the old slot and
occupy the new slot.

## RBAC

Managers and secretaries may mutate appointment lifecycle state. Doctors remain
read-only and receive `403` from mutation routes.

## Production Smoke Boundary

Production smoke must use synthetic data, mock/synthetic providers, and a
temporary SQLite database or Docker volume. It must not call real Meta or Google
providers and must not persist patient data, credentials, logs, backups, WAL,
SHM, journal, or generated SQLite artifacts in git.
