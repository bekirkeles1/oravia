const {
  handleAppointmentLifecycleGet,
  rejectMethod,
} = require("../../../../../../src/api/secretaryAppointmentChangeRouteHandler");

async function GET(request, context = {}) {
  return handleAppointmentLifecycleGet(request, context);
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST: rejectMethod,
  PUT: rejectMethod,
};
