const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GOOGLE_DEMO_EVENT_SUMMARY,
  handleDemoAppointment,
  handleDemoAvailability,
  handleDemoClassify,
  handleDemoGoogleCalendarEvent
} = require("../src/api/demoApiHandlers");

const sampleMessage = "Merhaba, implant için randevu almak istiyorum.";

test("demo classify API handler validates missing message", () => {
  const result = handleDemoClassify({});

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "message is required.");
});

test("demo classify API handler returns local classifier result", () => {
  const result = handleDemoClassify({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.result.intent, "appointment_request");
  assert.equal(result.body.result.confidence, 0.9);
  assert.equal(result.body.result.extracted_data.treatment_interest, "implant");
});

test("demo availability API handler returns mock clinic, doctor, and slots", () => {
  const result = handleDemoAvailability({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.clinic.name, "Oravia Demo Dental Clinic");
  assert.equal(result.body.doctor.name, "Dr. Demo Dentist");
  assert.equal(result.body.calendar_provider, "mock");
  assert.equal(result.body.available_slots.length, 3);
  assert.equal(result.body.intent, "appointment_request");
});

test("demo appointment API handler dynamically selects an offered mock slot", () => {
  const result = handleDemoAppointment({
    message: sampleMessage
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.selected_slot.id, "demo_2026-07-06_1400");
  assert.equal(result.body.appointment.status, "confirmed");
  assert.equal(result.body.appointment.created_by, "ai");
  assert.equal(result.body.appointment.calendar_provider, "mock");
  assert.match(
    result.body.appointment.calendar_event_id,
    /^mock_calendar_event_demo_2026-07-06_1400$/
  );
});

test("demo appointment API handler accepts selected_slot_id", () => {
  const result = handleDemoAppointment({
    message: sampleMessage,
    selected_slot_id: "demo_2026-07-06_1600"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.selected_slot.id, "demo_2026-07-06_1600");
  assert.equal(
    result.body.appointment.calendar_event_id,
    "mock_calendar_event_demo_2026-07-06_1600"
  );
});

test("demo appointment API handler rejects invalid selected_slot_id", () => {
  const result = handleDemoAppointment({
    message: sampleMessage,
    selected_slot_id: "not_an_offered_slot"
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "selected_slot_id does not match an offered demo slot."
  );
  assert.deepEqual(result.body.available_slot_ids, [
    "demo_2026-07-06_1000",
    "demo_2026-07-06_1400",
    "demo_2026-07-06_1600"
  ]);
});

test("Google Calendar demo event handler requires explicit confirmation", async () => {
  let createEventCalled = false;
  const result = await handleDemoGoogleCalendarEvent(
    {},
    {
      calendarProvider: {
        name: "google_service_account",
        getAvailableSlots() {
          return [];
        },
        createCalendarEvent() {
          createEventCalled = true;
        }
      }
    }
  );

  assert.equal(result.status, 400);
  assert.equal(createEventCalled, false);
  assert.match(result.body.error, /confirm_real_calendar_event must be true/);
});

test("Google Calendar demo event handler uses demo data and custom event title", async () => {
  let createdEventInput = null;
  const result = await handleDemoGoogleCalendarEvent(
    {
      message: sampleMessage,
      confirm_real_calendar_event: true
    },
    {
      now: new Date("2026-07-06T07:00:00.000Z"),
      calendarProvider: {
        name: "google_service_account",
        getAvailableSlots() {
          return Promise.resolve([
            {
              id: "demo_2026-07-06_1400",
              start_at: "2026-07-06T14:00:00+03:00",
              end_at: "2026-07-06T14:30:00+03:00",
              timezone: "Europe/Istanbul",
              duration_minutes: 30,
              display_label: "6 Temmuz Pazartesi 14:00"
            },
            {
              id: "demo_2026-07-06_1600",
              start_at: "2026-07-06T16:00:00+03:00",
              end_at: "2026-07-06T16:30:00+03:00",
              timezone: "Europe/Istanbul",
              duration_minutes: 30,
              display_label: "6 Temmuz Pazartesi 16:00"
            }
          ]);
        },
        createCalendarEvent(eventInput) {
          createdEventInput = eventInput;

          return Promise.resolve({
            calendar_provider: "google_service_account",
            calendar_event_id: "google_demo_event_123",
            start_time: eventInput.selectedSlot.start_at,
            end_time: eventInput.selectedSlot.end_at
          });
        }
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(createdEventInput.summary, GOOGLE_DEMO_EVENT_SUMMARY);
  assert.equal(createdEventInput.patient.name, null);
  assert.equal(createdEventInput.patient.phone, null);
  assert.equal(result.body.demo_data_only, true);
  assert.equal(result.body.event_title, GOOGLE_DEMO_EVENT_SUMMARY);
  assert.equal(result.body.appointment.status, "confirmed");
  assert.equal(result.body.calendar_provider, "google_service_account");
  assert.equal(result.body.calendar_event_id, "google_demo_event_123");
});
