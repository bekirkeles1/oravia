const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildConversationStateKey,
  createInMemoryConversationStateStore,
} = require("../src/messaging/conversationStateStore");

test("buildConversationStateKey uses channel and sender only", () => {
  assert.equal(
    buildConversationStateKey({
      channel: "whatsapp",
      from: "+905322223333",
      message: "10:30 olur",
    }),
    "whatsapp:+905322223333"
  );
  assert.equal(buildConversationStateKey({ channel: "whatsapp" }), null);
});

test("in-memory conversation state store saves, loads, and clears appointment flow state", () => {
  const store = createInMemoryConversationStateStore();
  const key = "whatsapp:+905322223333";
  const state = {
    status: "pending_appointment_selection",
    offeredSlots: [{ id: "slot-1", time: "10:30" }],
  };

  assert.equal(store.getAppointmentFlowState(key), null);
  assert.deepEqual(store.setAppointmentFlowState(key, state), state);
  assert.deepEqual(store.getAppointmentFlowState(key), state);
  assert.equal(store.clearAppointmentFlowState(key), true);
  assert.equal(store.getAppointmentFlowState(key), null);
});

test("in-memory conversation state store returns defensive copies", () => {
  const store = createInMemoryConversationStateStore();
  const key = "whatsapp:+905322223333";
  store.setAppointmentFlowState(key, {
    status: "pending_appointment_selection",
    offeredSlots: [{ id: "slot-1", time: "10:30" }],
  });

  const loadedState = store.getAppointmentFlowState(key);
  loadedState.offeredSlots[0].time = "mutated";

  assert.equal(store.getAppointmentFlowState(key).offeredSlots[0].time, "10:30");
});
