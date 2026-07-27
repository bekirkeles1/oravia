const {
  handleEmptySlotCancelPost,
  rejectMethod,
} = require("../../../../../src/api/secretaryEmptySlotRouteHandler");

async function POST(request) {
  return handleEmptySlotCancelPost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
