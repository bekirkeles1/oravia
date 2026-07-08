const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleMessagingInbound
} = require("../src/api/messagingInboundHandler");
const {
  createPendingAppointmentFlowState,
  getPendingOfferedSlots
} = require("../src/messaging/appointmentFlowState");
const {
  buildConversationStateKey,
  createInMemoryConversationStateStore
} = require("../src/messaging/conversationStateStore");
const { generateSlotProposals } = require("../src/messaging/slotProposal");

const validInput = {
  channel: "whatsapp",
  from: "+905322223333",
  message: "İmplant için randevu almak istiyorum",
  timestamp: "2026-07-06T15:30:00+03:00"
};

function createSampleAppointmentFlowState() {
  return createPendingAppointmentFlowState(
    generateSlotProposals({
      message: "İmplant yaptırmak istiyorum, çarşamba müsait slot var mı?",
      maxSlots: 3
    })
  );
}

test("messaging inbound handler validates missing required fields", () => {
  const result = handleMessagingInbound({});

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Missing required messaging inbound fields.");
  assert.deepEqual(result.body.missing_fields, [
    "channel",
    "from",
    "message",
    "timestamp"
  ]);
});

test("messaging inbound handler rejects unsupported channel", () => {
  const result = handleMessagingInbound({
    ...validInput,
    channel: "instagram"
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Unsupported messaging channel "instagram".');
  assert.deepEqual(result.body.supported_channels, ["whatsapp"]);
});

test("messaging inbound handler rejects blank message", () => {
  const result = handleMessagingInbound({
    ...validInput,
    message: "   "
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Missing required messaging inbound fields.");
  assert.deepEqual(result.body.missing_fields, ["message"]);
});

test("messaging inbound handler rejects invalid timestamp", () => {
  const result = handleMessagingInbound({
    ...validInput,
    timestamp: "not-a-date"
  });

  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    "timestamp must be a valid date/time string."
  );
  assert.equal(result.body.field, "timestamp");
});

test("messaging inbound handler returns appointment_request for WhatsApp implant appointment message", () => {
  const result = handleMessagingInbound(validInput);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    status: "received",
    channel: "whatsapp",
    from: "+905322223333",
    intent: "appointment_request",
    requires_handoff: false,
    reply_draft: "İmplant randevusu için uygun saatleri kontrol ediyorum."
  });
});

test("messaging inbound handler returns requires_handoff true for unknown intent", () => {
  const result = handleMessagingInbound({
    ...validInput,
    message: "Merhaba, nasılsınız?"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received");
  assert.equal(result.body.intent, "unknown_intent");
  assert.equal(result.body.requires_handoff, true);
  assert.match(result.body.reply_draft, /klinik ekibimize aktaracağım/);
});

test("messaging inbound handler does not call calendar provider or appointment creation", () => {
  let calendarProviderCalled = false;
  let appointmentCreationCalled = false;
  const result = handleMessagingInbound(validInput, {
    calendarProvider() {
      calendarProviderCalled = true;
    },
    createAppointment() {
      appointmentCreationCalled = true;
    }
  });

  assert.equal(result.status, 200);
  assert.equal(calendarProviderCalled, false);
  assert.equal(appointmentCreationCalled, false);
});

test("messaging inbound handler preserves channel and from in response", () => {
  const result = handleMessagingInbound({
    ...validInput,
    from: "+905551112233"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.channel, "whatsapp");
  assert.equal(result.body.from, "+905551112233");
});

test("messaging inbound handler can return treatment info reply through reply planner", () => {
  const result = handleMessagingInbound({
    channel: "whatsapp",
    from: "+905322223333",
    message: "İmplant nedir, bilgi alabilir miyim?",
    timestamp: "2026-07-06T15:35:00+03:00"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received");
  assert.equal(result.body.channel, "whatsapp");
  assert.equal(result.body.from, "+905322223333");
  assert.equal(result.body.intent, "treatment_info");
  assert.equal(result.body.requires_handoff, false);
  assert.match(result.body.reply_draft, /eksik dişlerin yerine/);
  assert.match(result.body.reply_draft, /hekim muayenesi/);
  assert.equal(result.body.appointmentFlowState, undefined);
});

test("messaging inbound handler returns handoff for risky clinical message", () => {
  const result = handleMessagingInbound({
    channel: "whatsapp",
    from: "+905322223333",
    message: "Dişim çok ağrıyor ve yüzüm şişti, hangi antibiyotiği kullanmalıyım?",
    timestamp: "2026-07-06T15:40:00+03:00"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received");
  assert.equal(result.body.intent, "handoff_required");
  assert.equal(result.body.requires_handoff, true);
  assert.match(result.body.reply_draft, /klinik ekibimizin değerlendirmesini gerektiriyor/);
  assert.equal(result.body.appointmentFlowState, undefined);
});

test("messaging inbound handler includes appointment flow state when proposing slots", () => {
  const result = handleMessagingInbound({
    ...validInput,
    message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_proposal");
  assert.equal(result.body.requires_handoff, false);
  assert.match(result.body.reply_draft, /mock ilk muayene \/ değerlendirme slot önerileri/);
  assert.equal(
    result.body.appointmentFlowState.status,
    "pending_appointment_selection"
  );
  assert.equal(result.body.appointmentFlowState.treatment, "implant");
  assert.equal(result.body.appointmentFlowState.day, "wednesday");
  assert.deepEqual(
    result.body.appointmentFlowState.offeredSlots.map((slot) => slot.time),
    ["10:00", "10:30", "11:00"]
  );
  assert.doesNotMatch(
    JSON.stringify(result.body.appointmentFlowState),
    /randevunuz oluşturuldu|booked|confirmed/i
  );
});

test("returned appointment flow state can be passed into the next inbound selection", () => {
  const proposalResult = handleMessagingInbound({
    ...validInput,
    message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
  });
  const selectionResult = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      appointmentFlowState: proposalResult.body.appointmentFlowState
    }
  );

  assert.equal(selectionResult.status, 200);
  assert.equal(selectionResult.body.intent, "appointment_slot_selection");
  assert.equal(
    selectionResult.body.appointment_selection_status,
    "selected_slot_matched"
  );
  assert.equal(selectionResult.body.selected_slot.time, "10:30");
  assert.match(selectionResult.body.reply_draft, /henüz kesin randevu değildir/);
  assert.doesNotMatch(selectionResult.body.reply_draft, /randevunuz oluşturuldu/i);
});

test("messaging inbound handler saves appointment flow state when store is provided", () => {
  const conversationStateStore = createInMemoryConversationStateStore();
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      conversationStateStore
    }
  );
  const key = buildConversationStateKey(validInput);
  const storedState = conversationStateStore.getAppointmentFlowState(key);

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_proposal");
  assert.equal(storedState.status, "pending_appointment_selection");
  assert.deepEqual(
    storedState.offeredSlots.map((slot) => slot.time),
    ["10:00", "10:30", "11:00"]
  );
});

test("messaging inbound handler can load stored appointment flow state for next selection", () => {
  const conversationStateStore = createInMemoryConversationStateStore();
  handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      conversationStateStore
    }
  );

  const selectionResult = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      conversationStateStore
    }
  );

  assert.equal(selectionResult.status, 200);
  assert.equal(selectionResult.body.intent, "appointment_slot_selection");
  assert.equal(
    selectionResult.body.appointment_selection_status,
    "selected_slot_matched"
  );
  assert.equal(selectionResult.body.selected_slot.time, "10:30");
  assert.match(selectionResult.body.reply_draft, /henüz kesin randevu değildir/);
});

test("messaging inbound handler clears stored flow state after matched selection", () => {
  const conversationStateStore = createInMemoryConversationStateStore();
  const key = buildConversationStateKey(validInput);
  handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      conversationStateStore
    }
  );

  assert.ok(conversationStateStore.getAppointmentFlowState(key));

  handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      conversationStateStore
    }
  );

  assert.equal(conversationStateStore.getAppointmentFlowState(key), null);
});

test("messaging inbound handler keeps no-store behavior unchanged for later selection", () => {
  const proposalResult = handleMessagingInbound({
    ...validInput,
    message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
  });
  const selectionResult = handleMessagingInbound({
    ...validInput,
    message: "10:30 olur"
  });

  assert.equal(proposalResult.body.intent, "appointment_slot_proposal");
  assert.equal(selectionResult.body.intent, "unknown_intent");
  assert.equal(selectionResult.body.appointment_selection_status, undefined);
});

test("messaging inbound handler can match pending appointment selection by visible time", () => {
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      appointmentFlowState: createSampleAppointmentFlowState()
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_selection");
  assert.equal(result.body.requires_handoff, false);
  assert.equal(
    result.body.appointment_selection_status,
    "selected_slot_matched"
  );
  assert.equal(result.body.selected_slot.time, "10:30");
  assert.match(result.body.reply_draft, /10:30 slotunu seçtiniz/);
  assert.match(result.body.reply_draft, /henüz kesin randevu değildir/);
  assert.doesNotMatch(result.body.reply_draft, /randevunuz oluşturuldu/i);
});

test("messaging inbound handler can match pending appointment selection by selected_slot_id", () => {
  const appointmentFlowState = createSampleAppointmentFlowState();
  const offeredSlot = getPendingOfferedSlots(appointmentFlowState)[1];
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "Bu slot uygun.",
      selected_slot_id: offeredSlot.id
    },
    {
      appointmentFlowState
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_selection");
  assert.equal(
    result.body.appointment_selection_status,
    "selected_slot_matched"
  );
  assert.equal(result.body.selected_slot.id, offeredSlot.id);
  assert.match(result.body.reply_draft, /henüz kesin randevu değildir/);
});

test("messaging inbound handler keeps current appointment request behavior without flow state", () => {
  const result = handleMessagingInbound(validInput);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    status: "received",
    channel: "whatsapp",
    from: "+905322223333",
    intent: "appointment_request",
    requires_handoff: false,
    reply_draft: "İmplant randevusu için uygun saatleri kontrol ediyorum."
  });
});

test("messaging inbound handler returns safe clarification for unknown pending selection", () => {
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "15:00 olur"
    },
    {
      appointmentFlowState: createSampleAppointmentFlowState()
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_selection");
  assert.equal(
    result.body.appointment_selection_status,
    "selected_slot_not_found"
  );
  assert.equal(result.body.selected_slot, null);
  assert.match(result.body.reply_draft, /eşleştiremedim/);
  assert.match(result.body.reply_draft, /10:00, 10:30, 11:00/);
});

test("messaging inbound handler keeps handoff above pending appointment selection", () => {
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur ama yüzüm şişti ve çok ağrıyor."
    },
    {
      appointmentFlowState: createSampleAppointmentFlowState()
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "handoff_required");
  assert.equal(result.body.requires_handoff, true);
  assert.equal(result.body.appointment_selection_status, undefined);
  assert.match(result.body.reply_draft, /klinik ekibimizin değerlendirmesini gerektiriyor/);
});

test("messaging inbound handler keeps handoff above stored pending appointment selection", () => {
  const conversationStateStore = createInMemoryConversationStateStore();
  handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      conversationStateStore
    }
  );
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur ama yüzüm şişti ve çok ağrıyor."
    },
    {
      conversationStateStore
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "handoff_required");
  assert.equal(result.body.appointment_selection_status, undefined);
  assert.match(result.body.reply_draft, /klinik ekibimizin değerlendirmesini gerektiriyor/);
});

test("messaging inbound pending selection does not call appointment creation or calendar provider", () => {
  let calendarProviderCalled = false;
  let appointmentCreationCalled = false;
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      appointmentFlowState: createSampleAppointmentFlowState(),
      calendarProvider() {
        calendarProviderCalled = true;
      },
      createAppointment() {
        appointmentCreationCalled = true;
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_selection");
  assert.equal(calendarProviderCalled, false);
  assert.equal(appointmentCreationCalled, false);
});

test("messaging inbound slot proposal does not call appointment creation or calendar provider", () => {
  let calendarProviderCalled = false;
  let appointmentCreationCalled = false;
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      calendarProvider() {
        calendarProviderCalled = true;
      },
      createAppointment() {
        appointmentCreationCalled = true;
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_proposal");
  assert.equal(result.body.appointmentFlowState.status, "pending_appointment_selection");
  assert.equal(calendarProviderCalled, false);
  assert.equal(appointmentCreationCalled, false);
});

test("messaging inbound store-backed selection does not call appointment creation or calendar provider", () => {
  let calendarProviderCalled = false;
  let appointmentCreationCalled = false;
  const conversationStateStore = createInMemoryConversationStateStore();
  handleMessagingInbound(
    {
      ...validInput,
      message: "İmplant yaptırmak istiyorum, çarşamba saat önerir misiniz?"
    },
    {
      conversationStateStore
    }
  );
  const result = handleMessagingInbound(
    {
      ...validInput,
      message: "10:30 olur"
    },
    {
      conversationStateStore,
      calendarProvider() {
        calendarProviderCalled = true;
      },
      createAppointment() {
        appointmentCreationCalled = true;
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.intent, "appointment_slot_selection");
  assert.equal(calendarProviderCalled, false);
  assert.equal(appointmentCreationCalled, false);
});
