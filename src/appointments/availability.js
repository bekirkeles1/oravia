const { getCalendarProvider } = require("../calendar/calendarProvider");
const { demoClinic, demoDoctor } = require("../demo/demoData");

function getDemoAvailableSlots(options = {}) {
  const calendarProvider = options.calendarProvider || getCalendarProvider();

  return calendarProvider.getAvailableSlots({
    clinic: options.clinic || demoClinic,
    doctor: options.doctor || demoDoctor,
    now: options.now,
    limit: options.limit || 3
  });
}

module.exports = {
  getDemoAvailableSlots
};
