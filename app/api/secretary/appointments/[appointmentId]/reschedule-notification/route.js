const {
  handleAppointmentChangePost,
  rejectMethod,
} = require("../../../../../../src/api/secretaryAppointmentChangeRouteHandler");

async function POST(request, context = {}) {
  return handleAppointmentChangePost(request, context, "reschedule_notification");
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
