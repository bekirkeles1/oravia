const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleGetSecretaryDoctorAvailability,
  handleGetSecretaryDoctors,
  handleGetSecretaryDoctorsOverview,
  handleUpdateSecretaryDoctorAvailability,
} = require("../src/api/secretaryDoctorsHandler");

test("secretary doctors handler returns safe mock doctor list", () => {
  const response = handleGetSecretaryDoctors();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.ok(Array.isArray(response.body.doctors));
  assert.equal(response.body.doctors.length, 4);

  const doctor = response.body.doctors[0];

  assert.ok(doctor.id);
  assert.ok(doctor.name);
  assert.ok(Array.isArray(doctor.specialties));
  assert.ok(Array.isArray(doctor.treatments));
  assert.ok(Array.isArray(doctor.mockWorkingDays));
});

test("secretary doctors handler does not expose price or patient data", () => {
  const response = handleGetSecretaryDoctors();
  const serialized = JSON.stringify(response.body);

  assert.doesNotMatch(serialized, /\bTL\b|₺|price|fee|ücret|fiyat/i);
  assert.doesNotMatch(serialized, /patient|hasta geçmişi|tc kimlik|diagnosis/i);
});

test("secretary doctor availability handler returns safe mock weekly schedules", () => {
  const response = handleGetSecretaryDoctorAvailability();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.ok(Array.isArray(response.body.availability));
  assert.equal(response.body.availability.length, 4);

  const availability = response.body.availability[0];

  assert.ok(availability.doctorId);
  assert.equal(availability.source, "mock");
  assert.ok(Array.isArray(availability.weeklyAvailability));
  assert.equal(availability.weeklyAvailability.length, 7);
});

test("secretary doctor availability handler returns defensive data from source modules", () => {
  const response = handleGetSecretaryDoctorAvailability();

  response.body.availability[0].doctorId = "changed-doctor";
  response.body.availability[0].weeklyAvailability[0].windows.push({
    start: "00:00",
    end: "23:59",
  });

  const freshResponse = handleGetSecretaryDoctorAvailability();

  assert.equal(freshResponse.body.availability[0].doctorId, "dr-ayse-demir");
  assert.equal(
    freshResponse.body.availability[0].weeklyAvailability[0].windows.length,
    2
  );
});

test("secretary doctors overview combines doctors with their availability", () => {
  const response = handleGetSecretaryDoctorsOverview();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.ok(Array.isArray(response.body.doctors));
  assert.equal(response.body.doctors.length, 4);

  const implantDoctor = response.body.doctors.find(
    (doctor) => doctor.id === "dr-ayse-demir"
  );

  assert.ok(implantDoctor);
  assert.ok(implantDoctor.availability);
  assert.equal(implantDoctor.availability.doctorId, "dr-ayse-demir");
  assert.equal(implantDoctor.availability.weeklyAvailability.length, 7);
});

test("secretary doctors overview keeps mock source explicit", () => {
  const response = handleGetSecretaryDoctorsOverview();
  const serialized = JSON.stringify(response.body);

  assert.match(serialized, /mock/);
  assert.doesNotMatch(serialized, /randevunuz oluşturuldu/i);
  assert.doesNotMatch(serialized, /google_service_account/i);
});

test("secretary doctor availability update validates a mock enabled day update", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Çarşamba",
    enabled: true,
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.source, "mock");
  assert.equal(response.body.persistence, "not_persisted");
  assert.equal(response.body.doctor.id, "dr-ayse-demir");
  assert.equal(response.body.updatedAvailability.doctorId, "dr-ayse-demir");
  assert.equal(response.body.updatedAvailability.dayAvailability.day, "wednesday");
  assert.equal(response.body.updatedAvailability.dayAvailability.dayLabel, "Çarşamba");
  assert.equal(response.body.updatedAvailability.dayAvailability.enabled, true);
  assert.deepEqual(response.body.updatedAvailability.dayAvailability.windows, [
    { start: "09:00", end: "12:00" },
  ]);
  assert.equal(response.body.safety.createsAppointment, false);
  assert.equal(response.body.safety.writesCalendar, false);
  assert.equal(response.body.safety.checksCalendarConflict, false);
  assert.equal(response.body.safety.exposesPatientData, false);
});

test("secretary doctor availability update validates a mock disabled day update", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Pazar",
    enabled: false,
    windows: [],
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.updatedAvailability.dayAvailability.day, "sunday");
  assert.equal(response.body.updatedAvailability.dayAvailability.enabled, false);
  assert.deepEqual(response.body.updatedAvailability.dayAvailability.windows, []);
});

test("secretary doctor availability update rejects missing doctor id", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    day: "Çarşamba",
    enabled: true,
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.status, "error");
  assert.equal(response.body.error.code, "missing_doctor_id");
});

test("secretary doctor availability update rejects unknown doctor id", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "missing-doctor",
    day: "Çarşamba",
    enabled: true,
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.status, "error");
  assert.equal(response.body.error.code, "doctor_not_found");
});

test("secretary doctor availability update rejects invalid day", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "tatil günü",
    enabled: true,
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_day");
});

test("secretary doctor availability update requires enabled to be boolean", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Çarşamba",
    enabled: "yes",
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_enabled");
});

test("secretary doctor availability update rejects enabled day without windows", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Çarşamba",
    enabled: true,
    windows: [],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "enabled_day_requires_windows");
});

test("secretary doctor availability update rejects disabled day with windows", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Pazar",
    enabled: false,
    windows: [{ start: "09:00", end: "12:00" }],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "disabled_day_cannot_have_windows");
});

test("secretary doctor availability update rejects invalid time windows", () => {
  const response = handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Çarşamba",
    enabled: true,
    windows: [{ start: "12:00", end: "09:00" }],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_time_window");
  assert.match(response.body.error.message, /windows\[0\]/);
});

test("secretary doctor availability update does not mutate current mock schedule", () => {
  const beforeUpdate = handleGetSecretaryDoctorAvailability();

  handleUpdateSecretaryDoctorAvailability({
    doctorId: "dr-ayse-demir",
    day: "Çarşamba",
    enabled: true,
    windows: [{ start: "08:00", end: "09:00" }],
  });

  const afterUpdate = handleGetSecretaryDoctorAvailability();

  assert.deepEqual(afterUpdate.body.availability, beforeUpdate.body.availability);
  assert.equal(
    afterUpdate.body.availability[0].weeklyAvailability.find(
      (day) => day.day === "wednesday"
    ).windows[0].start,
    "10:00"
  );
});
