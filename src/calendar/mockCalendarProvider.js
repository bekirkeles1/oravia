const { demoClinic, demoDoctor } = require("../demo/demoData");
const { buildDemoSlots } = require("./calendarSlotUtils");

function createMockCalendarProvider() {
  return {
    name: "mock",
    getAvailableSlots(options = {}) {
      return getMockAvailableSlots(options);
    },
    createCalendarEvent(eventInput) {
      return createMockCalendarEvent(eventInput);
    },
    updateCalendarEvent(command) {
      return {
        calendar_provider: "mock",
        calendar_event_id: command.providerEventId,
        start_time: command.selectedSlot.start_at,
        end_time: command.selectedSlot.end_at,
      };
    },
    cancelCalendarEvent(command) {
      return {
        calendar_provider: "mock",
        calendar_event_id: command.providerEventId,
        cancelled: true,
      };
    }
  };
}

function getMockAvailableSlots(options = {}) {
  const clinic = options.clinic || demoClinic;
  const doctor = options.doctor || demoDoctor;
  const now = options.now || new Date();
  const limit = options.limit || 3;

  return buildDemoSlots({ clinic, doctor, now, limit });
}

function createMockCalendarEvent({ selectedSlot }) {
  return {
    calendar_provider: "mock",
    calendar_event_id: `mock_calendar_event_${selectedSlot.id}`,
    start_time: selectedSlot.start_at,
    end_time: selectedSlot.end_at
  };
}

module.exports = {
  createMockCalendarProvider
};
