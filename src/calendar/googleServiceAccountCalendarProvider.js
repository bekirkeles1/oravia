const fs = require("node:fs");
const path = require("node:path");

const { google } = require("googleapis");

const { demoClinic, demoDoctor } = require("../demo/demoData");
const { buildDemoSlots } = require("./calendarSlotUtils");

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_ACCESS_DENIED_MESSAGE =
  "Share the Google Calendar with the service account email and grant Make changes to events.";

function createGoogleServiceAccountCalendarProvider(options = {}) {
  const keyFilePath =
    options.keyFilePath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const calendarId = options.calendarId || process.env.GOOGLE_CALENDAR_ID;
  const googleClient = options.googleClient || google;

  if (!calendarId) {
    throw new Error(
      "GOOGLE_CALENDAR_ID is required when CALENDAR_PROVIDER=google_service_account. Set it to the shared Google Calendar ID."
    );
  }

  const keyFile = resolveServiceAccountKeyFile(keyFilePath);

  const auth = new googleClient.auth.GoogleAuth({
    keyFile,
    scopes: [GOOGLE_CALENDAR_SCOPE]
  });
  const calendar = googleClient.calendar({
    version: "v3",
    auth
  });

  return {
    name: "google_service_account",
    calendarId,
    async checkCalendarAccess() {
      try {
        await calendar.events.list({
          calendarId,
          maxResults: 1,
          singleEvents: true,
          timeMin: new Date().toISOString()
        });
      } catch (error) {
        throw normalizeGoogleCalendarError(error);
      }
    },
    async getAvailableSlots(options = {}) {
      const clinic = options.clinic || demoClinic;
      const doctor = options.doctor || demoDoctor;
      const now = options.now || new Date();
      const limit = options.limit || 3;
      const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const busyWindows = await getBusyWindows({
        calendar,
        calendarId,
        timeMin: now,
        timeMax
      });

      return buildDemoSlots({
        clinic,
        doctor,
        now,
        limit,
        isSlotAvailable(slot) {
          return !isSlotBusy(slot, busyWindows);
        }
      });
    },
    async createCalendarEvent(eventInput) {
      const selectedSlot = eventInput.selectedSlot;

      if (!selectedSlot) {
        throw new Error("selectedSlot is required to create a calendar event.");
      }

      try {
        const response = await calendar.events.insert({
          calendarId,
          requestBody: buildEventRequestBody(eventInput)
        });

        return {
          calendar_provider: "google_service_account",
          calendar_event_id: response.data.id,
          start_time: selectedSlot.start_at,
          end_time: selectedSlot.end_at
        };
      } catch (error) {
        throw normalizeGoogleCalendarError(error);
      }
    }
  };
}

function resolveServiceAccountKeyFile(keyFilePath) {
  if (!keyFilePath) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required when CALENDAR_PROVIDER=google_service_account. Set it to the local service account JSON file path."
    );
  }

  const resolvedPath = path.resolve(keyFilePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Google service account key file not found at ${resolvedPath}. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH to an existing local JSON key file. Do not commit this file.`
    );
  }

  try {
    const parsedKey = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));

    if (!parsedKey.client_email || !parsedKey.private_key) {
      throw new Error("missing client_email or private_key");
    }
  } catch (error) {
    throw new Error(
      `Google service account key file at ${resolvedPath} is not a valid service account JSON file.`
    );
  }

  return resolvedPath;
}

async function getBusyWindows({ calendar, calendarId, timeMin, timeMax }) {
  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }]
      }
    });
    const calendarData = response.data.calendars?.[calendarId];
    const calendarErrors = calendarData?.errors;

    if (Array.isArray(calendarErrors) && calendarErrors.length > 0) {
      throw normalizeGoogleCalendarError({
        code: 403,
        errors: calendarErrors
      });
    }

    const calendarBusy = calendarData?.busy;

    return Array.isArray(calendarBusy) ? calendarBusy : [];
  } catch (error) {
    throw normalizeGoogleCalendarError(error);
  }
}

function buildEventRequestBody({
  clinic = demoClinic,
  doctor = demoDoctor,
  patient = {},
  treatmentInterest,
  selectedSlot,
  summary
}) {
  return {
    summary: summary || buildEventSummary(treatmentInterest),
    description: buildEventDescription({ clinic, doctor, patient }),
    start: {
      dateTime: selectedSlot.start_at,
      timeZone: selectedSlot.timezone || clinic.timezone
    },
    end: {
      dateTime: selectedSlot.end_at,
      timeZone: selectedSlot.timezone || clinic.timezone
    }
  };
}

function buildEventSummary(treatmentInterest) {
  return treatmentInterest
    ? `Oravia Appointment - ${treatmentInterest}`
    : "Oravia Appointment";
}

function buildEventDescription({ clinic, doctor, patient }) {
  const lines = [
    "Created by Oravia.",
    `Clinic: ${clinic.name}`,
    `Doctor: ${doctor.name}`
  ];

  if (patient.name) {
    lines.push(`Patient: ${patient.name}`);
  }

  if (patient.phone) {
    lines.push(`Phone: ${patient.phone}`);
  }

  return lines.join("\n");
}

function isSlotBusy(slot, busyWindows) {
  const slotStart = new Date(slot.start_at).getTime();
  const slotEnd = new Date(slot.end_at).getTime();

  return busyWindows.some((busyWindow) => {
    const busyStart = new Date(busyWindow.start).getTime();
    const busyEnd = new Date(busyWindow.end).getTime();

    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

function normalizeGoogleCalendarError(error) {
  if (isCalendarAccessDenied(error)) {
    return new Error(CALENDAR_ACCESS_DENIED_MESSAGE);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isCalendarAccessDenied(error) {
  const statusCode = Number(error?.code || error?.response?.status);
  const reason =
    error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason;

  return (
    statusCode === 403 ||
    statusCode === 404 ||
    reason === "forbidden" ||
    reason === "notFound"
  );
}

module.exports = {
  CALENDAR_ACCESS_DENIED_MESSAGE,
  GOOGLE_CALENDAR_SCOPE,
  createGoogleServiceAccountCalendarProvider
};
