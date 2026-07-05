const { runDemoAppointmentFlow } = require("../appointments/appointmentCreation");
const { getCalendarProvider } = require("../calendar/calendarProvider");

const DASHBOARD_DEMO_NOW = new Date("2026-07-05T09:00:00.000Z");

function getDemoDashboardData() {
  const appointmentResult = runDemoAppointmentFlow(
    {
      initialMessage: "Merhaba, implant için randevu almak istiyorum.",
      selectionMessage: ""
    },
    {
      now: DASHBOARD_DEMO_NOW,
      calendarProvider: getCalendarProvider("mock")
    }
  );

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
    ]
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

module.exports = {
  getDemoDashboardData
};
