const {
  handleEmptySlotRunOncePost,
  rejectMethod,
} = require("../../../../../src/api/secretaryEmptySlotRouteHandler");

async function POST(request) {
  return handleEmptySlotRunOncePost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
