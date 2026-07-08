const { handleMessagingInbound } = require("../src/api/messagingInboundHandler");
const {
  buildConversationStateKey,
  createInMemoryConversationStateStore,
} = require("../src/messaging/conversationStateStore");
const {
  createInMemoryAppointmentReviewQueue,
} = require("../src/secretary/appointmentReviewQueue");

const conversationStateStore = createInMemoryConversationStateStore();
const appointmentReviewQueue = createInMemoryAppointmentReviewQueue();
const baseInboundMessage = {
  channel: "whatsapp",
  from: "+905322223333",
  timestamp: "2026-07-06T15:30:00+03:00",
};
const conversationKey = buildConversationStateKey(baseInboundMessage);

const firstResult = handleMessagingInbound(
  {
    ...baseInboundMessage,
    message: "İmplant için çarşamba saat önerir misiniz?",
  },
  {
    conversationStateStore,
  }
);

const secondResult = handleMessagingInbound(
  {
    ...baseInboundMessage,
    message: "10:30 olur",
    timestamp: "2026-07-06T15:31:00+03:00",
  },
  {
    conversationStateStore,
  }
);

const reviewAddResult = secondResult.body.appointmentSelectionReview
  ? appointmentReviewQueue.addAppointmentReview(
      secondResult.body.appointmentSelectionReview,
      {
        conversationKey,
      }
    )
  : {
      status: "error",
      error: {
        code: "missing_appointment_selection_review",
        message: "Second response did not include appointmentSelectionReview.",
      },
    };
const reviewQueueItems = appointmentReviewQueue.listAppointmentReviews();

const output = {
  firstResponse: firstResult.body,
  secondResponse: secondResult.body,
  reviewQueueItems,
  bookingCreated: reviewQueueItems.some(
    (review) => review.bookingCreated === true
  ),
  calendarChecked: reviewQueueItems.some(
    (review) => review.calendarChecked === true
  ),
  requiresSecretaryConfirmation: reviewQueueItems.every(
    (review) => review.requiresSecretaryConfirmation === true
  ),
};

console.log(JSON.stringify(output, null, 2));

if (
  firstResult.status >= 400 ||
  secondResult.status >= 400 ||
  reviewAddResult.status !== "ok" ||
  reviewQueueItems.length !== 1 ||
  reviewQueueItems[0].status !== "pending_secretary_review" ||
  output.bookingCreated !== false ||
  output.calendarChecked !== false ||
  output.requiresSecretaryConfirmation !== true
) {
  process.exitCode = 1;
}
