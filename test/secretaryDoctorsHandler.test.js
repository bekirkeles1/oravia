const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleGetSecretaryDoctorAvailability,
  handleGetSecretaryDoctors,
  handleGetSecretaryDoctorsOverview,
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
