const { demoClinic, demoDoctor } = require("../demo/demoData");

const ISTANBUL_UTC_OFFSET_MINUTES = 180;
const DEMO_SLOT_TIMES = ["10:00", "14:00", "16:00"];

function createMockCalendarProvider() {
  return {
    name: "mock",
    getAvailableSlots(options = {}) {
      return getMockAvailableSlots(options);
    },
    createCalendarEvent(eventInput) {
      return createMockCalendarEvent(eventInput);
    }
  };
}

function getMockAvailableSlots(options = {}) {
  const clinic = options.clinic || demoClinic;
  const doctor = options.doctor || demoDoctor;
  const now = options.now || new Date();
  const limit = options.limit || 3;
  const slots = [];
  const today = getZonedDateParts(now, clinic.timezone);

  for (let dayOffset = 0; slots.length < limit && dayOffset < 14; dayOffset += 1) {
    const dateParts = addDays(today, dayOffset);

    if (isSunday(dateParts)) {
      continue;
    }

    for (const time of DEMO_SLOT_TIMES) {
      const slot = buildSlot(dateParts, time, clinic, doctor);

      if (slotStartsAfter(slot, now)) {
        slots.push(slot);
      }

      if (slots.length === limit) {
        break;
      }
    }
  }

  return slots;
}

function createMockCalendarEvent({ selectedSlot }) {
  return {
    calendar_provider: "mock",
    calendar_event_id: `mock_calendar_event_${selectedSlot.id}`,
    start_time: selectedSlot.start_at,
    end_time: selectedSlot.end_at
  };
}

function buildSlot(dateParts, time, clinic, doctor) {
  const [hour, minute] = time.split(":").map(Number);
  const startDate = createIstanbulDate(dateParts, hour, minute);
  const endDate = new Date(
    startDate.getTime() + doctor.appointment_duration_minutes * 60 * 1000
  );

  return {
    id: `demo_${dateParts.year}-${pad2(dateParts.month)}-${pad2(
      dateParts.day
    )}_${time.replace(":", "")}`,
    start_at: formatIstanbulOffsetDateTime(startDate),
    end_at: formatIstanbulOffsetDateTime(endDate),
    timezone: clinic.timezone,
    duration_minutes: doctor.appointment_duration_minutes,
    display_label: formatDisplayLabel(startDate, clinic.timezone)
  };
}

function slotStartsAfter(slot, now) {
  return new Date(slot.start_at).getTime() > now.getTime();
}

function getZonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function addDays(dateParts, days) {
  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days, 12)
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function isSunday(dateParts) {
  const localNoon = createIstanbulDate(dateParts, 12, 0);

  return localNoon.getUTCDay() === 0;
}

function createIstanbulDate(dateParts, hour, minute) {
  return new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      hour,
      minute
    ) -
      ISTANBUL_UTC_OFFSET_MINUTES * 60 * 1000
  );
}

function formatIstanbulOffsetDateTime(date) {
  const localDate = new Date(
    date.getTime() + ISTANBUL_UTC_OFFSET_MINUTES * 60 * 1000
  );

  return `${localDate.getUTCFullYear()}-${pad2(
    localDate.getUTCMonth() + 1
  )}-${pad2(localDate.getUTCDate())}T${pad2(localDate.getUTCHours())}:${pad2(
    localDate.getUTCMinutes()
  )}:00+03:00`;
}

function formatDisplayLabel(date, timeZone) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

module.exports = {
  createMockCalendarProvider
};
