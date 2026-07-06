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
    productName:
      "Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard",
    clinic: appointmentResult.appointment.clinic,
    doctor: appointmentResult.appointment.doctor,
    systemStatus: [
      {
        name: "Demo API",
        status: "Ready",
        tone: "ready"
      },
      {
        name: "Mock Appointment API",
        status: "Ready",
        tone: "ready"
      },
      {
        name: "Dashboard Mode",
        status: "Internal operations / Provider aware",
        tone: "safe"
      },
      {
        name: "Google Calendar CLI Flow",
        status: "Available",
        tone: "available"
      },
      {
        name: "Optional Google Calendar Demo Event",
        status: "Explicit confirmation only",
        tone: "disabled"
      },
      {
        name: "WhatsApp Integration",
        status: "Not connected",
        tone: "not-connected"
      },
      {
        name: "Database",
        status: "Not connected",
        tone: "not-connected"
      }
    ],
    appointments: [
      {
        id: appointmentResult.appointment.id,
        patientName: "Demo Patient",
        treatmentInterest: appointmentResult.appointment.treatment_interest,
        startTime: appointmentResult.appointment.start_time,
        endTime: appointmentResult.appointment.end_time,
        startDisplayLabel: appointmentResult.selected_slot.display_label,
        endDisplayLabel: formatIsoTime(appointmentResult.appointment.end_time),
        status: appointmentResult.appointment.status,
        createdBy: appointmentResult.appointment.created_by,
        calendarProvider: appointmentResult.appointment.calendar_provider,
        calendarProviderLabel: getCalendarProviderLabel(
          appointmentResult.appointment.calendar_provider
        ),
        calendarEventId: appointmentResult.appointment.calendar_event_id
      }
    ],
    rolePrototype: buildRolePrototypeData({
      appointment: appointmentResult.appointment,
      selectedSlot: appointmentResult.selected_slot
    }),
    simulator: {
      label: "Demo API mode — no real patient data, no real calendar event",
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
        endAt: slot.end_at,
        timeRangeLabel: `${formatIsoTime(slot.start_at)} to ${formatIsoTime(
          slot.end_at
        )}`
      })),
      reply: simulatorResult.reply,
      calendarProvider: "mock",
      calendarProviderLabel: getCalendarProviderLabel("mock")
    }
  };
}

function buildRolePrototypeData({ appointment, selectedSlot }) {
  return {
    defaultRole: "secretary",
    note:
      "Rol seçici yerel prototiptir. Gerçek kimlik doğrulama ve yetkiler daha sonra eklenecek.",
    topSummary: [
      { label: "Bugünkü randevular", value: "3", detail: "Demo klinik günü" },
      { label: "Bekleyen devirler / handoff", value: "1", detail: "Sekreter takibi" },
      { label: "Takvim senkron durumu", value: "Mock senkron", detail: "Demo takvim" },
      { label: "Demo modu", value: "Aktif", detail: "Gerçek hasta verisi yok" }
    ],
    roles: [
      {
        id: "doctor",
        label: "Doktor",
        description: "Doktorlar için sabah randevu ve hasta hazırlık ekranı."
      },
      {
        id: "secretary",
        label: "Sekreter",
        description: "Ön büro için günlük operasyon, handoff ve takvim ekranı."
      },
      {
        id: "admin",
        label: "Yönetici",
        description: "Klinik sahibi için performans ve dönüşüm göstergeleri."
      }
    ],
    doctor: {
      title: "Doktor Ekranı",
      subtitle: "Sabah ilk bakışta randevu, hasta notu ve AI özeti.",
      todayAppointments: [
        {
          time: selectedSlot.display_label,
          patientName: "Demo Patient",
          treatmentInterest: appointment.treatment_interest,
          appointmentStatus: appointment.status,
          patientNotes:
            "Demo not: hasta implant görüşmesi için randevu istedi. Gerçek hasta verisi yok.",
          aiConversationSummary:
            "AI özeti: hasta implant randevusu istiyor ve önerilen demo saati kabul etti."
        }
      ],
      weeklyOverview: [
        { day: "Pazartesi", appointments: 3, focus: "İmplant görüşmeleri" },
        { day: "Salı", appointments: 2, focus: "Genel diş hekimliği" },
        { day: "Çarşamba", appointments: 4, focus: "Kontrol randevuları" },
        { day: "Perşembe", appointments: 2, focus: "Beyazlatma görüşmeleri" },
        { day: "Cuma", appointments: 3, focus: "Karma randevu akışı" }
      ]
    },
    secretary: {
      title: "Sekreter Operasyon Ekranı",
      subtitle: "Günün randevu akışı, handoff kuyruğu ve takvim senkronu.",
      todayOperations: [
        { label: "Onaylı randevular", value: "3" },
        { label: "Bekleyen handoff", value: "1" },
        { label: "Düzenleme bekleyen", value: "0" },
        { label: "Takvim senkronu", value: "Mock senkron" }
      ],
      handoffQueue: [
        {
          patientName: "Demo Patient",
          reason: "Tedavi fiyatı için takip",
          status: "Sekreter kontrolü bekliyor"
        }
      ],
      phoneCallEntryPlaceholder:
        "Telefonla gelen randevu sekreter işlemi olarak takvim sağlayıcısına gönderilir.",
      doctorAvailability: [
        { doctorName: "Dr. Demo Dentist", nextSlot: "6 Temmuz Pazartesi 16:00" },
        { doctorName: "Dr. Demo Dentist", nextSlot: "7 Temmuz Salı 10:00" }
      ],
      googleCalendarSyncStatus: {
        provider: appointment.calendar_provider,
        status: "Mock takvim senkron",
        lastEventId: appointment.calendar_event_id
      }
    },
    admin: {
      title: "Yönetici Performans Ekranı",
      subtitle: "Klinik sahibi için randevu hacmi, doluluk ve dönüşüm özeti.",
      metrics: [
        { label: "Toplam randevu", value: "12" },
        { label: "AI kaynaklı randevular", value: "8" },
        { label: "Telefonla gelen randevular", value: "3" },
        { label: "Handoff oranı", value: "14%" },
        { label: "Doktor doluluk oranı", value: "72%" },
        { label: "Dönüşüm göstergeleri", value: "Güçlü" }
      ],
      conversionIndicators: [
        "İmplant randevu talepleri demo akışında iyi dönüşüyor.",
        "Bir handoff sekreter takibi bekliyor.",
        "Mock takvim aynı hafta randevu önermeyi destekliyor."
      ]
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

function formatIsoTime(value) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);

  return match ? match[1] : "";
}

module.exports = {
  getDemoDashboardData
};
