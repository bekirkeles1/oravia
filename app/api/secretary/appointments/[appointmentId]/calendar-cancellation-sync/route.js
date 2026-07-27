const {
  handleAppointmentChangePost,
  rejectMethod,
} = require("../../../../../../src/api/secretaryAppointmentChangeRouteHandler");

async function POST(request, context = {}) {
  return handleAppointmentChangePost(request, context, "calendar_cancellation");
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
