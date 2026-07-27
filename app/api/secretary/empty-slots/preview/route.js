const {
  handleEmptySlotPreviewPost,
  rejectMethod,
} = require("../../../../../src/api/secretaryEmptySlotRouteHandler");

async function POST(request) {
  return handleEmptySlotPreviewPost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
