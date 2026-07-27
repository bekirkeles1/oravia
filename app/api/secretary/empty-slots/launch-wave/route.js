const {
  handleEmptySlotLaunchPost,
  rejectMethod,
} = require("../../../../../src/api/secretaryEmptySlotRouteHandler");

async function POST(request) {
  return handleEmptySlotLaunchPost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
