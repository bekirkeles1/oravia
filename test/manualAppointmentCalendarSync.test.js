const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildManualAppointmentDescription,
  buildManualAppointmentTitle,
  createManualAppointmentCalendarEvent
} = require("../src/appointments/manualAppointmentCalendarSync");

const validNow = "2026-07-06T12:00:00+03:00";

const validPayload = {
  patientName: "Demo Hasta",
  patientPhone: "0532 123 45 67",
  treatment: "İmplant görüşmesi",
  doctor: "Dr. Demo Dentist",
  date: "2026-07-06",
  time: "15:30",
  duration: "45",
  notes: "Hasta fiyat bilgisi de sordu."
};

test("manual appointment calendar sync validates required payload fields", async () => {
  const result = await createManualAppointmentCalendarEvent(
    {},
    {
      calendarProvider: {
        createCalendarEvent() {
          throw new Error("calendar provider should not be called");
        }
      }
    }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Missing required manual appointment fields.");
  assert.deepEqual(result.body.missing_fields, [
    "patientName",
    "patientPhone",
    "treatment",
    "doctor",
    "date",
    "time",
    "duration"
  ]);
});

test("manual appointment calendar sync rejects invalid Turkish mobile phone", async () => {
  const result = await createManualAppointmentCalendarEvent(
    {
      ...validPayload,
      patientPhone: "0212 123 45 67"
    },
    {
      calendarProvider: {
        createCalendarEvent() {
          throw new Error("calendar provider should not be called");
        }
      }
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "patientPhone must be a valid Turkish mobile number."
  );
});

test("manual appointment calendar sync rejects invalid calendar dates", async () => {
  const result = await createManualAppointmentCalendarEvent(
    {
      ...validPayload,
      date: "2026-02-31"
    },
    {
      calendarProvider: {
        createCalendarEvent() {
          throw new Error("calendar provider should not be called");
        }
      }
    }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "date must be in YYYY-MM-DD format.");
  assert.equal(result.body.field, "date");
});

test("manual appointment calendar sync rejects past appointment start times", async () => {
  const result = await createManualAppointmentCalendarEvent(
    {
      ...validPayload,
      time: "11:30"
    },
    {
      now: validNow,
      calendarProvider: {
        createCalendarEvent() {
          throw new Error("calendar provider should not be called");
        }
      }
    }
  );

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "appointment start time must be in the future."
  );
  assert.equal(result.body.field, "start_time");
});

test("manual appointment calendar sync creates a mock calendar event", async () => {
  const result = await createManualAppointmentCalendarEvent(validPayload, {
    calendarProviderName: "mock",
    now: validNow
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.appointment.patient_name, "Demo Hasta");
  assert.equal(result.body.appointment.patient_phone, "05321234567");
  assert.equal(result.body.appointment.source, "phone_call");
  assert.equal(result.body.appointment.created_by, "secretary");
  assert.equal(result.body.appointment.calendar_provider, "mock");
  assert.equal(result.body.appointment.sync_status, "synced");
  assert.equal(result.body.selected_slot.start_at, "2026-07-06T15:30:00+03:00");
  assert.equal(result.body.selected_slot.end_at, "2026-07-06T16:15:00+03:00");
  assert.match(
    result.body.calendar_event_id,
    /^mock_calendar_event_manual_2026-07-06_1530$/
  );
});

test("manual appointment calendar sync sends title and description to provider", async () => {
  let createdEventInput = null;
  const result = await createManualAppointmentCalendarEvent(validPayload, {
    calendarProvider: {
      createCalendarEvent(eventInput) {
        createdEventInput = eventInput;

        return Promise.resolve({
          calendar_provider: "google_service_account",
          calendar_event_id: "google_manual_event_123",
          start_time: eventInput.selectedSlot.start_at,
          end_time: eventInput.selectedSlot.end_at
        });
      }
    }
  });

  assert.equal(result.status, 200);
  assert.equal(
    createdEventInput.summary,
    "Oravia Manual Appointment - Demo Hasta - İmplant görüşmesi"
  );
  assert.match(createdEventInput.description, /Patient phone: 05321234567/);
  assert.match(createdEventInput.description, /Source: phone_call/);
  assert.match(createdEventInput.description, /Created by: secretary/);
  assert.match(
    createdEventInput.description,
    /Internal clinic operation\. Not patient-facing dashboard booking\./
  );
  assert.match(createdEventInput.description, /Hasta fiyat bilgisi de sordu\./);
  assert.equal(result.body.calendar_provider, "google_service_account");
  assert.equal(result.body.calendar_event_id, "google_manual_event_123");
});

test("manual appointment title and description include secretary context", () => {
  assert.equal(
    buildManualAppointmentTitle(validPayload),
    "Oravia Manual Appointment - Demo Hasta - İmplant görüşmesi"
  );
  assert.match(
    buildManualAppointmentDescription({
      ...validPayload,
      patientPhone: "05321234567"
    }),
    /Created by Oravia secretary manual appointment desk\./
  );
});
