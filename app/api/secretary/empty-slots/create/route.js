const {
  handleEmptySlotCreatePost,
  rejectMethod,
} = require("../../../../../src/api/secretaryEmptySlotRouteHandler");

async function POST(request) {
  return handleEmptySlotCreatePost(request);
}

module.exports = {
  DELETE: rejectMethod,
  GET: rejectMethod,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
