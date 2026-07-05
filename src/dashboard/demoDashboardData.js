const { runDemoAppointmentFlow } = require("../appointments/appointmentCreation");
const { runDemoAvailabilityFlow } = require("../appointments/demoAvailabilityFlow");
const { getCalendarProvider } = require("../calendar/calendarProvider");

const DASHBOARD_DEMO_NOW = new Date("2026-07-05T09:00:00.000Z");
const SAMPLE_PATIENT_MESSAGE =
  "Merhaba, implant için randevu almak istiyorum.";

function getDemoDashboardData() {
  const mockCalendarProvider = getCalendarProvider("mock");
  const appointmentResult = runDemoAppointmentFlow(
    {
      initialMessage: SAMPLE_PATIENT_MESSAGE,
      selectionMessage: ""
    },
    {
      now: DASHBOARD_DEMO_NOW,
      calendarProvider: mockCalendarProvider
    }
  );
  const simulatorResult = runDemoAvailabilityFlow(SAMPLE_PATIENT_MESSAGE, {
    now: DASHBOARD_DEMO_NOW,
    calendarProvider: mockCalendarProvider
  });

  if (isPromiseLike(appointmentResult) || isPromiseLike(simulatorResult)) {
    throw new Error("Dashboard demo data must use synchronous mock providers.");
  }

  return buildDashboardData({
    appointmentResult,
    simulatorResult
  });
}

function buildDashboardData({ appointmentResult, simulatorResult }) {
  return {
    productName: "Oravia Dental Receptionist",
    clinic: appointmentResult.appointment.clinic,
    doctor: appointmentResult.appointment.doctor,
    appointments: [
      {
        id: appointmentResult.appointment.id,
        patientName: "Demo Patient",
        treatmentInterest: appointmentResult.appointment.treatment_interest,
        startTime: appointmentResult.appointment.start_time,
        endTime: appointmentResult.appointment.end_time,
        status: appointmentResult.appointment.status,
        createdBy: appointmentResult.appointment.created_by,
        calendarProvider: appointmentResult.appointment.calendar_provider,
        calendarProviderLabel: getCalendarProviderLabel(
          appointmentResult.appointment.calendar_provider
        ),
        calendarEventId: appointmentResult.appointment.calendar_event_id
      }
    ],
    simulator: {
      label: "Demo simulator — no real patient data",
      patientMessage: SAMPLE_PATIENT_MESSAGE,
      intent: simulatorResult.intent,
      confidence: simulatorResult.confidence,
      treatmentInterest: simulatorResult.treatment_interest,
      requiresHandoff: simulatorResult.requires_handoff,
      patientMessageSummary: simulatorResult.patient_message_summary,
      availableSlots: simulatorResult.available_slots.map((slot) => ({
        id: slot.id,
        displayLabel: slot.display_label,
        startAt: slot.start_at,
        endAt: slot.end_at
      })),
      reply: simulatorResult.reply,
      calendarProvider: "mock",
      calendarProviderLabel: getCalendarProviderLabel("mock")
    }
  };
}

function getCalendarProviderLabel(calendarProvider) {
  if (calendarProvider === "google_service_account") {
    return "Google Calendar service account";
  }

  if (calendarProvider === "mock") {
    return "Mock calendar";
  }

  return calendarProvider;
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

module.exports = {
  getDemoDashboardData
};
