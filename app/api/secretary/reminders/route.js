const {
  handleReminderStateGet,
  rejectMethod,
} = require("../../../../src/api/secretaryAppointmentReminderRouteHandler");

async function GET(request) {
  return handleReminderStateGet(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST: rejectMethod,
  PUT: rejectMethod,
};
