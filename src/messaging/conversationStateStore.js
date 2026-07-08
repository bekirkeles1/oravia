function buildConversationStateKey(input = {}) {
  const channel = normalizeKeyPart(input.channel);
  const from = normalizeKeyPart(input.from);

  if (!channel || !from) {
    return null;
  }

  return `${channel}:${from}`;
}

function createInMemoryConversationStateStore(initialState = {}) {
  const appointmentFlowStates = new Map(
    Object.entries(initialState.appointmentFlowStates || {})
  );

  return {
    getAppointmentFlowState(key) {
      return cloneState(appointmentFlowStates.get(key) || null);
    },
    setAppointmentFlowState(key, state) {
      if (!key || !state) {
        return null;
      }

      const clonedState = cloneState(state);
      appointmentFlowStates.set(key, clonedState);
      return cloneState(clonedState);
    },
    clearAppointmentFlowState(key) {
      if (!key) {
        return false;
      }

      return appointmentFlowStates.delete(key);
    },
  };
}

function normalizeKeyPart(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function cloneState(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

module.exports = {
  buildConversationStateKey,
  createInMemoryConversationStateStore,
};
