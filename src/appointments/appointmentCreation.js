const { demoClinic, demoDoctor } = require("../demo/demoData");
const { getCalendarProvider } = require("../calendar/calendarProvider");
const { runDemoAvailabilityFlow } = require("./demoAvailabilityFlow");

const demoPatient = {
  id: "patient_demo",
  name: null,
  phone: null
};

function runDemoAppointmentFlow(messages = {}, options = {}) {
  const initialMessage =
    messages.initialMessage || "Merhaba, implant için randevu almak istiyorum.";
  const selectionMessage =
    messages.selectionMessage || "29 Haziran 14:00 uygun.";
  const calendarProvider = options.calendarProvider || getCalendarProvider();
  const availabilityResult = runDemoAvailabilityFlow(initialMessage, {
    now: options.now,
    calendarProvider
  });

  if (isPromiseLike(availabilityResult)) {
    return availabilityResult.then((resolvedAvailabilityResult) =>
      completeDemoAppointmentFlow({
        availabilityResult: resolvedAvailabilityResult,
        selectionMessage,
        options,
        calendarProvider
      })
    );
  }

  return completeDemoAppointmentFlow({
    availabilityResult,
    selectionMessage,
    options,
    calendarProvider
  });
}

function completeDemoAppointmentFlow({
  availabilityResult,
  selectionMessage,
  options,
  calendarProvider
}) {
  const selectedSlot = resolveSelectedSlot(
    selectionMessage,
    availabilityResult.available_slots
  );
  const appointment = selectedSlot
    ? createLocalAppointment({
        selectedSlot,
        treatmentInterest: availabilityResult.treatment_interest,
        patient: options.patient || demoPatient,
        calendarProvider
      })
    : null;

  if (isPromiseLike(appointment)) {
    return appointment.then((resolvedAppointment) =>
      buildDemoAppointmentResult({
        availabilityResult,
        selectedSlot,
        appointment: resolvedAppointment
      })
    );
  }

  return buildDemoAppointmentResult({
    availabilityResult,
    selectedSlot,
    appointment
  });
}

function buildDemoAppointmentResult({
  availabilityResult,
  selectedSlot,
  appointment
}) {
  const confirmationMessage = appointment
    ? appointment.confirmation_message
    : buildClarificationMessage(availabilityResult.available_slots);

  return {
    initial_message_classification: {
      intent: availabilityResult.intent,
      confidence: availabilityResult.confidence,
      requires_handoff: availabilityResult.requires_handoff,
      patient_message_summary: availabilityResult.patient_message_summary,
      treatment_interest: availabilityResult.treatment_interest
    },
    available_slots: availabilityResult.available_slots,
    selected_slot: selectedSlot,
    appointment,
    confirmation_message: confirmationMessage
  };
}

function resolveSelectedSlot(selectionMessage, availableSlots) {
  const explicitSelection = matchSelectedSlot(selectionMessage, availableSlots);

  if (explicitSelection) {
    return explicitSelection;
  }

  if (!availableSlots.length) {
    return null;
  }

  const fallbackSlot = availableSlots[1] || availableSlots[0];
  const simulatedSelection = buildSimulatedSelectionMessage(fallbackSlot);

  return matchSelectedSlot(simulatedSelection, availableSlots) || fallbackSlot;
}

function matchSelectedSlot(selectionMessage, availableSlots) {
  const normalizedSelection = normalizeTurkish(selectionMessage);
  const selectedTime = extractSelectedTime(normalizedSelection);
  const selectedDay = extractSelectedDay(normalizedSelection);

  if (!selectedTime || !selectedDay) {
    return null;
  }

  return (
    availableSlots.find((slot) => {
      const slotParts = getSlotParts(slot);

      return slotParts.day === selectedDay && slotParts.time === selectedTime;
    }) || null
  );
}

function createLocalAppointment({
  selectedSlot,
  treatmentInterest,
  patient,
  calendarEventSummary,
  calendarProvider = getCalendarProvider()
}) {
  const calendarEvent = calendarProvider.createCalendarEvent({
    clinic: demoClinic,
    doctor: demoDoctor,
    patient,
    treatmentInterest,
    selectedSlot,
    summary: calendarEventSummary
  });

  if (isPromiseLike(calendarEvent)) {
    return calendarEvent.then((resolvedCalendarEvent) =>
      buildLocalAppointment({
        selectedSlot,
        treatmentInterest,
        patient,
        calendarEvent: resolvedCalendarEvent
      })
    );
  }

  return buildLocalAppointment({
    selectedSlot,
    treatmentInterest,
    patient,
    calendarEvent
  });
}

function buildLocalAppointment({
  selectedSlot,
  treatmentInterest,
  patient,
  calendarEvent
}) {
  const appointment = {
    id: `appointment_${selectedSlot.id}`,
    clinic: {
      id: demoClinic.id,
      name: demoClinic.name,
      timezone: demoClinic.timezone,
      address: demoClinic.address
    },
    doctor: {
      id: demoDoctor.id,
      name: demoDoctor.name,
      specialty: demoDoctor.specialty
    },
    patient,
    treatment_interest: treatmentInterest,
    start_time: selectedSlot.start_at,
    end_time: selectedSlot.end_at,
    status: "confirmed",
    created_by: "ai",
    calendar_provider: calendarEvent.calendar_provider,
    calendar_event_id: calendarEvent.calendar_event_id,
    confirmation_message: buildConfirmationMessage(selectedSlot)
  };

  return appointment;
}

function buildConfirmationMessage(selectedSlot) {
  return `Randevunuz ${selectedSlot.display_label} için oluşturuldu. Klinik adresimiz: ${demoClinic.address}.`;
}

function buildClarificationMessage(availableSlots) {
  const slotText = availableSlots.map((slot) => slot.display_label).join(", ");

  return `Seçtiğiniz saati sunduğumuz randevu seçenekleriyle eşleştiremedim. Uygun seçenekler: ${slotText}. Lütfen bu saatlerden birini seçin.`;
}

function buildSimulatedSelectionMessage(slot) {
  if (!slot) {
    return "";
  }

  return slot.display_label || slot.start_at || "";
}

function extractSelectedTime(normalizedSelection) {
  const match = normalizedSelection.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);

  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function extractSelectedDay(normalizedSelection) {
  const match = normalizedSelection.match(/\b([1-9]|[12]\d|3[01])\b/);

  return match ? Number(match[1]) : null;
}

function getSlotParts(slot) {
  const match = slot.start_at.match(/^\d{4}-\d{2}-(\d{2})T(\d{2}:\d{2})/);

  if (!match) {
    return {
      day: null,
      time: null
    };
  }

  return {
    day: Number(match[1]),
    time: match[2]
  };
}

function normalizeTurkish(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

module.exports = {
  createLocalAppointment,
  matchSelectedSlot,
  resolveSelectedSlot,
  runDemoAppointmentFlow
};
