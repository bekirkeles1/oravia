const {
  handleEmptySlotConsentGet,
  handleEmptySlotConsentPost,
  rejectMethod,
} = require("../../../../../../src/api/secretaryEmptySlotRouteHandler");

async function GET(request, context) {
  return handleEmptySlotConsentGet(request, context);
}

async function POST(request, context) {
  return handleEmptySlotConsentPost(request, context);
}

module.exports = {
  DELETE: rejectMethod,
  GET,
  PATCH: rejectMethod,
  POST,
  PUT: rejectMethod,
};
