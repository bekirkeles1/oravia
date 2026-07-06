const assert = require("node:assert/strict");
const test = require("node:test");

const { getDemoDashboardData } = require("../src/dashboard/demoDashboardData");

test("dashboard simulator uses local classifier and mock availability only", () => {
  const dashboard = getDemoDashboardData();
  const simulator = dashboard.simulator;
  const appointment = dashboard.appointments[0];
  const rolePrototype = dashboard.rolePrototype;
  const statusByName = Object.fromEntries(
    dashboard.systemStatus.map((item) => [item.name, item.status])
  );

  assert.equal(
    dashboard.productName,
    "Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard"
  );
  assert.equal(statusByName["Demo API"], "Ready");
  assert.equal(statusByName["Mock Appointment API"], "Ready");
  assert.equal(statusByName["Dashboard Mode"], "Internal operations / Provider aware");
  assert.equal(statusByName["Google Calendar CLI Flow"], "Available");
  assert.equal(
    statusByName["Optional Google Calendar Demo Event"],
    "Explicit confirmation only"
  );
  assert.equal(statusByName["WhatsApp Integration"], "Not connected");
  assert.equal(statusByName.Database, "Not connected");
  assert.equal(appointment.startDisplayLabel, "6 Temmuz Pazartesi 14:00");
  assert.equal(appointment.endDisplayLabel, "14:30");
  assert.equal(rolePrototype.defaultRole, "secretary");
  assert.match(rolePrototype.note, /yerel prototiptir/);
  assert.deepEqual(
    rolePrototype.topSummary.map((item) => item.label),
    [
      "Bugünkü randevular",
      "Bekleyen devirler / handoff",
      "Takvim senkron durumu",
      "Demo modu"
    ]
  );
  assert.deepEqual(
    rolePrototype.roles.map((role) => role.label),
    ["Doktor", "Sekreter", "Yönetici"]
  );
  assert.equal(rolePrototype.doctor.title, "Doktor Ekranı");
  assert.equal(rolePrototype.secretary.title, "Sekreter Operasyon Ekranı");
  assert.equal(rolePrototype.admin.title, "Yönetici Performans Ekranı");
  assert.equal(rolePrototype.doctor.todayAppointments.length, 1);
  assert.equal(
    rolePrototype.doctor.todayAppointments[0].aiConversationSummary,
    "AI özeti: hasta implant randevusu istiyor ve önerilen demo saati kabul etti."
  );
  assert.equal(
    rolePrototype.secretary.phoneCallEntryPlaceholder,
    "Telefonla gelen randevu sekreter işlemi olarak takvim sağlayıcısına gönderilir."
  );
  assert.equal(
    rolePrototype.secretary.googleCalendarSyncStatus.provider,
    "mock"
  );
  assert.equal(rolePrototype.admin.metrics[0].label, "Toplam randevu");
  assert.equal(
    simulator.label,
    "Demo API mode — no real patient data, no real calendar event"
  );
  assert.equal(
    simulator.patientMessage,
    "Merhaba, implant için randevu almak istiyorum."
  );
  assert.equal(simulator.intent, "appointment_request");
  assert.equal(simulator.confidence, 0.9);
  assert.equal(simulator.treatmentInterest, "implant");
  assert.equal(simulator.requiresHandoff, false);
  assert.equal(
    simulator.patientMessageSummary,
    "Hasta implant için randevu almak istiyor."
  );
  assert.equal(simulator.calendarProvider, "mock");
  assert.equal(simulator.availableSlots.length, 3);
  assert.equal(simulator.availableSlots[0].timeRangeLabel, "10:00 to 10:30");
  assert.match(simulator.reply, /uygun randevu seçenekleri/);
});
