const PENDING_APPOINTMENT_SELECTION = "pending_appointment_selection";

function createPendingAppointmentFlowState(slotProposalResult, metadata = {}) {
  const offeredSlots = Array.isArray(slotProposalResult?.proposals)
    ? slotProposalResult.proposals.map(cloneSlot)
    : [];

  return {
    status: PENDING_APPOINTMENT_SELECTION,
    source: slotProposalResult?.source || null,
    treatment: slotProposalResult?.treatment || null,
    day: slotProposalResult?.day || null,
    appointmentPurpose: slotProposalResult?.appointmentPurpose || null,
    appointmentPurposeLabel: slotProposalResult?.appointmentPurposeLabel || null,
    offeredSlots,
    metadata: {
      ...metadata,
    },
  };
}

function getPendingOfferedSlots(flowState) {
  if (!hasPendingAppointment(flowState)) {
    return [];
  }

  return flowState.offeredSlots.map(cloneSlot);
}

function matchSelectedOfferedSlot(flowState, patientMessageOrSelection) {
  if (!hasPendingAppointment(flowState)) {
    return {
      status: "no_pending_appointment",
      selectedSlot: null,
    };
  }

  const offeredSlots = getPendingOfferedSlots(flowState);
  const selection = normalizeSelection(patientMessageOrSelection);

  if (!selection) {
    return {
      status: "missing_selection",
      selectedSlot: null,
    };
  }

  const selectedSlotId = extractSelectedSlotId(selection);

  if (selectedSlotId) {
    return buildSelectionResult(
      offeredSlots.find((slot) => slot.id === selectedSlotId)
    );
  }

  const selectedTime = extractSelectedTime(selection);

  if (!selectedTime) {
    return {
      status: "missing_selection",
      selectedSlot: null,
    };
  }

  const matchingSlots = offeredSlots.filter((slot) => slot.time === selectedTime);

  if (matchingSlots.length !== 1) {
    return {
      status: "selected_slot_not_found",
      selectedSlot: null,
    };
  }

  return buildSelectionResult(matchingSlots[0]);
}

function createAppointmentSelectionReply(flowState, patientMessageOrSelection) {
  const matchResult = matchSelectedOfferedSlot(
    flowState,
    patientMessageOrSelection
  );

  if (matchResult.status !== "selected_slot_matched") {
    return {
      ...matchResult,
      reply_draft: buildSelectionClarificationReply(matchResult.status, flowState),
    };
  }

  const slot = matchResult.selectedSlot;

  return {
    ...matchResult,
    appointmentSelectionReview: createAppointmentSelectionReview(
      flowState,
      slot
    ),
    reply_draft: [
      `${slot.doctorName} için ${slot.dayLabel} günü ${slot.time} slotunu seçtiniz.`,
      "Bu seçim henüz kesin randevu değildir; gerçek randevu oluşturulmadan önce klinik ekibi ve takvim çakışması kontrolü ile onaylanmalıdır.",
    ].join(" "),
  };
}

function createAppointmentSelectionReview(flowState, selectedSlot) {
  if (!hasPendingAppointment(flowState) || !selectedSlot) {
    return null;
  }

  return {
    status: "pending_secretary_confirmation",
    selectedSlot: cloneSlot(selectedSlot),
    treatment: flowState.treatment || selectedSlot.treatment || null,
    day: flowState.day || selectedSlot.day || null,
    appointmentPurpose:
      flowState.appointmentPurpose || selectedSlot.appointmentPurpose || null,
    appointmentPurposeLabel:
      flowState.appointmentPurposeLabel ||
      selectedSlot.appointmentPurposeLabel ||
      null,
    source: flowState.source || selectedSlot.source || null,
    requiresSecretaryConfirmation: true,
    bookingCreated: false,
    calendarChecked: false,
  };
}

function hasPendingAppointment(flowState) {
  return (
    flowState?.status === PENDING_APPOINTMENT_SELECTION &&
    Array.isArray(flowState.offeredSlots) &&
    flowState.offeredSlots.length > 0
  );
}

function buildSelectionResult(slot) {
  if (!slot) {
    return {
      status: "selected_slot_not_found",
      selectedSlot: null,
    };
  }

  return {
    status: "selected_slot_matched",
    selectedSlot: cloneSlot(slot),
  };
}

function buildSelectionClarificationReply(status, flowState) {
  if (status === "no_pending_appointment") {
    return "Seçilecek bekleyen bir randevu slotu bulunmuyor. Önce uygun slotları kontrol etmem gerekiyor.";
  }

  const offeredTimes = getPendingOfferedSlots(flowState)
    .map((slot) => slot.time)
    .filter(Boolean)
    .join(", ");

  if (status === "missing_selection") {
    return `Hangi slotu seçmek istediğinizi anlayamadım. Uygun seçenekler: ${offeredTimes}.`;
  }

  return `Seçtiğiniz saati sunduğumuz slotlarla eşleştiremedim. Uygun seçenekler: ${offeredTimes}.`;
}

function normalizeSelection(patientMessageOrSelection) {
  if (!patientMessageOrSelection) {
    return null;
  }

  if (typeof patientMessageOrSelection === "string") {
    return {
      message: patientMessageOrSelection,
      selected_slot_id: null,
    };
  }

  if (typeof patientMessageOrSelection === "object") {
    return {
      message: patientMessageOrSelection.message || "",
      selected_slot_id:
        patientMessageOrSelection.selected_slot_id ||
        patientMessageOrSelection.selectedSlotId ||
        null,
    };
  }

  return null;
}

function extractSelectedSlotId(selection) {
  return String(selection.selected_slot_id || "").trim() || null;
}

function extractSelectedTime(selection) {
  const normalizedMessage = String(selection.message || "");
  const match = normalizedMessage.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function cloneSlot(slot) {
  return {
    ...slot,
  };
}

module.exports = {
  PENDING_APPOINTMENT_SELECTION,
  createAppointmentSelectionReply,
  createAppointmentSelectionReview,
  createPendingAppointmentFlowState,
  getPendingOfferedSlots,
  matchSelectedOfferedSlot,
};
