const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getCalendarProvider } = require("../src/calendar/calendarProvider");
const {
  CALENDAR_ACCESS_DENIED_MESSAGE,
  createGoogleServiceAccountCalendarProvider
} = require("../src/calendar/googleServiceAccountCalendarProvider");
const { demoClinic, demoDoctor } = require("../src/demo/demoData");

test("mock calendar provider returns demo slots and creates fake calendar events", () => {
  const provider = getCalendarProvider("mock");
  const slots = provider.getAvailableSlots({
    clinic: demoClinic,
    doctor: demoDoctor,
    now: new Date("2026-06-28T09:00:00.000Z"),
    limit: 2
  });
  const event = provider.createCalendarEvent({
    clinic: demoClinic,
    doctor: demoDoctor,
    patient: { id: "patient_demo" },
    treatmentInterest: "implant",
    selectedSlot: slots[0]
  });

  assert.equal(provider.name, "mock");
  assert.equal(slots.length, 2);
  assert.equal(event.calendar_provider, "mock");
  assert.equal(event.calendar_event_id, `mock_calendar_event_${slots[0].id}`);
  assert.equal(event.start_time, slots[0].start_at);
  assert.equal(event.end_time, slots[0].end_at);
});

test("google service account provider requires an existing key file", () => {
  assert.throws(
    () =>
      createGoogleServiceAccountCalendarProvider({
        keyFilePath: path.join(os.tmpdir(), "missing-oravia-service-account.json"),
        calendarId: "calendar@example.com"
      }),
    /Google service account key file not found/
  );
});

test("google service account provider requires a calendar id", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-calendar-"));
  const keyFilePath = path.join(tempDir, "service-account.json");

  fs.writeFileSync(
    keyFilePath,
    JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "test-private-key"
    })
  );

  try {
    assert.throws(
      () =>
        createGoogleServiceAccountCalendarProvider({
          keyFilePath
        }),
      /GOOGLE_CALENDAR_ID is required/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("google service account provider creates event output with Google event id", async () => {
  const calendarId = "calendar@example.com";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-calendar-"));
  const keyFilePath = path.join(tempDir, "service-account.json");
  let authOptions = null;
  let insertRequest = null;

  fs.writeFileSync(
    keyFilePath,
    JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "test-private-key"
    })
  );

  const fakeGoogleClient = {
    auth: {
      GoogleAuth: class {
        constructor(options) {
          authOptions = options;
        }
      }
    },
    calendar() {
      return {
        events: {
          insert(request) {
            insertRequest = request;

            return Promise.resolve({
              data: {
                id: "google_event_123"
              }
            });
          }
        },
        freebusy: {
          query() {
            return Promise.resolve({
              data: {
                calendars: {
                  [calendarId]: {
                    busy: []
                  }
                }
              }
            });
          }
        }
      };
    }
  };

  try {
    const provider = createGoogleServiceAccountCalendarProvider({
      keyFilePath,
      calendarId,
      googleClient: fakeGoogleClient
    });
    const event = await provider.createCalendarEvent({
      clinic: demoClinic,
      doctor: demoDoctor,
      patient: { id: "patient_demo" },
      treatmentInterest: "implant",
      selectedSlot: {
        id: "demo_2026-06-29_1400",
        start_at: "2026-06-29T14:00:00+03:00",
        end_at: "2026-06-29T14:30:00+03:00",
        timezone: "Europe/Istanbul"
      }
    });

    assert.equal(provider.name, "google_service_account");
    assert.equal(authOptions.keyFile, keyFilePath);
    assert.deepEqual(authOptions.scopes, [
      "https://www.googleapis.com/auth/calendar"
    ]);
    assert.equal(insertRequest.calendarId, calendarId);
    assert.equal(insertRequest.requestBody.summary, "Oravia Appointment - implant");
    assert.equal(event.calendar_provider, "google_service_account");
    assert.equal(event.calendar_event_id, "google_event_123");
    assert.equal(event.start_time, "2026-06-29T14:00:00+03:00");
    assert.equal(event.end_time, "2026-06-29T14:30:00+03:00");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("google service account provider maps denied calendar access to clear guidance", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-calendar-"));
  const keyFilePath = path.join(tempDir, "service-account.json");

  fs.writeFileSync(
    keyFilePath,
    JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "test-private-key"
    })
  );

  const fakeGoogleClient = {
    auth: {
      GoogleAuth: class {}
    },
    calendar() {
      return {
        events: {
          list() {
            return Promise.reject({ code: 403 });
          },
          insert() {
            return Promise.reject({ code: 403 });
          }
        },
        freebusy: {
          query() {
            return Promise.reject({ code: 403 });
          }
        }
      };
    }
  };

  try {
    const provider = createGoogleServiceAccountCalendarProvider({
      keyFilePath,
      calendarId: "calendar@example.com",
      googleClient: fakeGoogleClient
    });

    await assert.rejects(
      provider.checkCalendarAccess(),
      new Error(CALENDAR_ACCESS_DENIED_MESSAGE)
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
