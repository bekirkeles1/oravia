const { classifyPatientMessage } = require("../ai/intentClassifier");
const { runDemoAvailabilityFlow } = require("../appointments/demoAvailabilityFlow");
const { createLocalAppointment } = require("../appointments/appointmentCreation");
const { getCalendarProvider } = require("../calendar/calendarProvider");
const { demoClinic, demoDoctor } = require("../demo/demoData");

const DEFAULT_DEMO_MESSAGE = "Merhaba, implant için randevu almak istiyorum.";
const DEMO_API_NOW = new Date("2026-07-05T09:00:00.000Z");
const GOOGLE_DEMO_EVENT_SUMMARY = "ORAVIA DEMO - Implant Appointment";
const demoPatient = {
  id: "patient_demo",
  name: null,
  phone: null
};

function handleDemoClassify(input = {}) {
  const validationError = validateMessage(input.message);

  if (validationError) {
    return validationError;
  }

  return ok({
    result: classifyPatientMessage(input.message)
  });
}

function handleDemoAvailability(input = {}) {
  const message = normalizeMessage(input.message) || DEFAULT_DEMO_MESSAGE;
  const result = runMockAvailability(message);

  return ok({
    clinic: result.clinic,
    doctor: result.doctor,
    intent: result.intent,
    confidence: result.confidence,
    requires_handoff: result.requires_handoff,
    patient_message_summary: result.patient_message_summary,
    treatment_interest: result.treatment_interest,
    available_slots: result.available_slots,
    reply: result.reply,
    calendar_provider: "mock"
  });
}

function handleDemoAppointment(input = {}) {
  const validationError = validateMessage(input.message);

  if (validationError) {
    return validationError;
  }

  const availability = runMockAvailability(input.message);
  const selectedSlot = resolveApiSelectedSlot(
    availability.available_slots,
    input.selected_slot_id
  );

  if (selectedSlot.error) {
    return selectedSlot.error;
  }

  if (!selectedSlot.slot) {
    return errorResponse(409, "No available demo slots could be offered.");
  }

  const appointment = createLocalAppointment({
    selectedSlot: selectedSlot.slot,
    treatmentInterest: availability.treatment_interest,
    patient: demoPatient,
    calendarProvider: getCalendarProvider("mock")
  });

  return ok({
    initial_message_classification: {
      intent: availability.intent,
      confidence: availability.confidence,
      requires_handoff: availability.requires_handoff,
      patient_message_summary: availability.patient_message_summary,
      treatment_interest: availability.treatment_interest
    },
    available_slots: availability.available_slots,
    selected_slot: selectedSlot.slot,
    appointment,
    confirmation_message: appointment.confirmation_message
  });
}

async function handleDemoGoogleCalendarEvent(input = {}, options = {}) {
  if (input.confirm_real_calendar_event !== true) {
    return errorResponse(
      400,
      "confirm_real_calendar_event must be true to create a real Google Calendar demo event."
    );
  }

  const message = normalizeMessage(input.message) || DEFAULT_DEMO_MESSAGE;
  const calendarProvider =
    options.calendarProvider || getCalendarProvider("google_service_account");
  const availability = await runDemoAvailabilityFlow(message, {
    now: options.now || new Date(),
    calendarProvider
  });
  const selectedSlot = resolveApiSelectedSlot(
    availability.available_slots,
    input.selected_slot_id
  );

  if (selectedSlot.error) {
    return selectedSlot.error;
  }

  if (!selectedSlot.slot) {
    return errorResponse(409, "No available Google Calendar demo slots could be offered.");
  }

  const appointment = await createLocalAppointment({
    selectedSlot: selectedSlot.slot,
    treatmentInterest: availability.treatment_interest,
    patient: demoPatient,
    calendarEventSummary: GOOGLE_DEMO_EVENT_SUMMARY,
    calendarProvider
  });

  return ok({
    warning:
      "Google Calendar demo event creates a real event in the configured demo calendar.",
    event_title: GOOGLE_DEMO_EVENT_SUMMARY,
    demo_data_only: true,
    patient: demoPatient,
    selected_slot: selectedSlot.slot,
    appointment,
    calendar_provider: appointment.calendar_provider,
    calendar_event_id: appointment.calendar_event_id
  });
}

function runMockAvailability(message) {
  return runDemoAvailabilityFlow(message, {
    now: DEMO_API_NOW,
    calendarProvider: getCalendarProvider("mock")
  });
}

function resolveApiSelectedSlot(availableSlots, selectedSlotId) {
  if (selectedSlotId) {
    const slot = availableSlots.find((availableSlot) => availableSlot.id === selectedSlotId);

    if (!slot) {
      return {
        error: errorResponse(400, "selected_slot_id does not match an offered demo slot.", {
          available_slot_ids: availableSlots.map((availableSlot) => availableSlot.id)
        })
      };
    }

    return { slot };
  }

  return {
    slot: availableSlots[1] || availableSlots[0] || null
  };
}

function validateMessage(message) {
  if (!normalizeMessage(message)) {
    return errorResponse(400, "message is required.");
  }

  return null;
}

function normalizeMessage(message) {
  return String(message || "").trim();
}

function ok(body) {
  return {
    status: 200,
    body
  };
}

function errorResponse(status, message, details = {}) {
  return {
    status,
    body: {
      error: message,
      ...details
    }
  };
}

module.exports = {
  DEFAULT_DEMO_MESSAGE,
  GOOGLE_DEMO_EVENT_SUMMARY,
  handleDemoAppointment,
  handleDemoAvailability,
  handleDemoClassify,
  handleDemoGoogleCalendarEvent
};
