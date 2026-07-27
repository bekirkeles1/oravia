const {
  handleAppointmentReminderHistoryGet,
  rejectMethod,
} = require("../../../../../../src/api/secretaryAppointmentReminderRouteHandler");

async function GET(request, context) {
  return handleAppointmentReminderHistoryGet(request, context);
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST: rejectMethod,
  PUT: rejectMethod,
};
