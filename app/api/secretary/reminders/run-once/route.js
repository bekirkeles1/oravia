const {
  handleReminderRunOncePost,
  rejectMethod,
} = require("../../../../../src/api/secretaryAppointmentReminderRouteHandler");

async function POST(request) {
  return handleReminderRunOncePost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
