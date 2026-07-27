const {
  handleReminderRetryPost,
  rejectMethod,
} = require("../../../../../src/api/secretaryAppointmentReminderRouteHandler");

async function POST(request) {
  return handleReminderRetryPost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
