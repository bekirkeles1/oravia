const {
  handleEmptySlotStateGet,
  rejectMethod,
} = require("../../../../src/api/secretaryEmptySlotRouteHandler");

async function GET(request) {
  return handleEmptySlotStateGet(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST: rejectMethod,
  PUT: rejectMethod,
};
