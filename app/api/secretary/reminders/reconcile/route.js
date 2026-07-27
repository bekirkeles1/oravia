const {
  handleReminderReconcilePost,
  rejectMethod,
} = require("../../../../../src/api/secretaryAppointmentReminderRouteHandler");

async function POST(request) {
  return handleReminderReconcilePost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
