const {
  handleAppointmentChangePost,
  rejectMethod,
} = require("../../../../../../src/api/secretaryAppointmentChangeRouteHandler");

async function POST(request, context = {}) {
  return handleAppointmentChangePost(request, context, "cancellation_preview");
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
