const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PENDING_APPOINTMENT_SELECTION,
  createAppointmentSelectionReply,
  createAppointmentSelectionReview,
  createPendingAppointmentFlowState,
  getPendingOfferedSlots,
  matchSelectedOfferedSlot,
} = require("../src/messaging/appointmentFlowState");
const { generateSlotProposals } = require("../src/messaging/slotProposal");

function createSampleSlotProposalResult() {
  return generateSlotProposals({
    message: "İmplant yaptırmak istiyorum, çarşamba müsait slot var mı?",
    maxSlots: 3,
  });
}

test("pending flow state can be created from a slot proposal result", () => {
  const slotProposalResult = createSampleSlotProposalResult();
  const flowState = createPendingAppointmentFlowState(slotProposalResult, {
    conversationId: "conversation_demo",
  });

  assert.equal(flowState.status, PENDING_APPOINTMENT_SELECTION);
  assert.equal(flowState.treatment, "implant");
  assert.equal(flowState.day, "wednesday");
  assert.equal(flowState.appointmentPurpose, "initial_consultation");
  assert.equal(flowState.metadata.conversationId, "conversation_demo");
  assert.equal(flowState.offeredSlots.length, 3);
  assert.deepEqual(
    flowState.offeredSlots.map((slot) => slot.time),
    ["10:00", "10:30", "11:00"]
  );
});

test("pending offered slots are returned as defensive copies", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const offeredSlots = getPendingOfferedSlots(flowState);
  offeredSlots[0].time = "mutated";

  assert.equal(getPendingOfferedSlots(flowState)[0].time, "10:00");
});

test("selected_slot_id matches only an offered slot", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const offeredSlot = getPendingOfferedSlots(flowState)[1];
  const matched = matchSelectedOfferedSlot(flowState, {
    selected_slot_id: offeredSlot.id,
  });
  const notFound = matchSelectedOfferedSlot(flowState, {
    selected_slot_id: "not-offered",
  });

  assert.equal(matched.status, "selected_slot_matched");
  assert.equal(matched.selectedSlot.id, offeredSlot.id);
  assert.equal(notFound.status, "selected_slot_not_found");
  assert.equal(notFound.selectedSlot, null);
});

test("visible time text matches an offered slot when unambiguous", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const matched = matchSelectedOfferedSlot(flowState, "10:30 olur");

  assert.equal(matched.status, "selected_slot_matched");
  assert.equal(matched.selectedSlot.time, "10:30");
  assert.equal(matched.selectedSlot.doctorName, "Dr. Ayşe Demir");
});

test("unknown time returns selected_slot_not_found", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const result = matchSelectedOfferedSlot(flowState, "15:00 olur");

  assert.equal(result.status, "selected_slot_not_found");
  assert.equal(result.selectedSlot, null);
});

test("no flow state returns no_pending_appointment", () => {
  const result = matchSelectedOfferedSlot(null, "10:30 olur");

  assert.equal(result.status, "no_pending_appointment");
  assert.equal(result.selectedSlot, null);
});

test("blank selection returns missing_selection", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const result = matchSelectedOfferedSlot(flowState, "   ");

  assert.equal(result.status, "missing_selection");
  assert.equal(result.selectedSlot, null);
});

test("confirmation reply is safe and does not claim booking is complete", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const result = createAppointmentSelectionReply(flowState, "10:30 olur");

  assert.equal(result.status, "selected_slot_matched");
  assert.match(result.reply_draft, /10:30 slotunu seçtiniz/);
  assert.match(result.reply_draft, /henüz kesin randevu değildir/);
  assert.match(result.reply_draft, /takvim çakışması kontrolü/);
  assert.doesNotMatch(result.reply_draft, /randevunuz oluşturuldu/i);
  assert.doesNotMatch(result.reply_draft, /booked/i);
});

test("appointment selection review payload is safe for secretary confirmation", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const selectedSlot = getPendingOfferedSlots(flowState)[1];
  const review = createAppointmentSelectionReview(flowState, selectedSlot);

  assert.equal(review.status, "pending_secretary_confirmation");
  assert.equal(review.selectedSlot.id, selectedSlot.id);
  assert.equal(review.selectedSlot.time, "10:30");
  assert.equal(review.treatment, "implant");
  assert.equal(review.day, "wednesday");
  assert.equal(review.appointmentPurpose, "initial_consultation");
  assert.equal(review.appointmentPurposeLabel, "İlk muayene / değerlendirme");
  assert.equal(review.source, "mock");
  assert.equal(review.requiresSecretaryConfirmation, true);
  assert.equal(review.bookingCreated, false);
  assert.equal(review.calendarChecked, false);
  assert.doesNotMatch(JSON.stringify(review), /randevunuz oluşturuldu|booked|confirmed/i);
});

test("appointment selection reply includes review payload only for matched slots", () => {
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult()
  );
  const matched = createAppointmentSelectionReply(flowState, "10:30 olur");
  const notFound = createAppointmentSelectionReply(flowState, "15:00 olur");

  assert.equal(
    matched.appointmentSelectionReview.status,
    "pending_secretary_confirmation"
  );
  assert.equal(matched.appointmentSelectionReview.bookingCreated, false);
  assert.equal(matched.appointmentSelectionReview.calendarChecked, false);
  assert.equal(notFound.appointmentSelectionReview, undefined);
});

test("helper does not call appointment creation or calendar provider", () => {
  let appointmentCreationCalled = false;
  let calendarProviderCalled = false;
  const flowState = createPendingAppointmentFlowState(
    createSampleSlotProposalResult(),
    {
      createAppointment() {
        appointmentCreationCalled = true;
      },
      calendarProvider() {
        calendarProviderCalled = true;
      },
    }
  );

  const result = createAppointmentSelectionReply(flowState, "10:30 olur");

  assert.equal(result.status, "selected_slot_matched");
  assert.equal(appointmentCreationCalled, false);
  assert.equal(calendarProviderCalled, false);
});
