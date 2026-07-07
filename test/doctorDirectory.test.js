const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDoctorDirectoryReply,
  doctorHandlesTreatment,
  findDoctorsByMessage,
  findDoctorsByTreatment,
  formatDoctorForPatient,
  getDoctorById,
  listDoctors,
  resolveTreatmentName,
} = require("../src/clinic/doctorDirectory");

test("doctor directory exposes mock doctors with specialties and treatments", () => {
  const doctors = listDoctors();

  assert.equal(doctors.length, 4);
  assert.ok(doctors.every((doctor) => doctor.id));
  assert.ok(doctors.every((doctor) => doctor.name));
  assert.ok(doctors.every((doctor) => doctor.specialties.length > 0));
  assert.ok(doctors.every((doctor) => doctor.treatments.length > 0));
  assert.ok(doctors.every((doctor) => doctor.mockWorkingDays.length > 0));
});

test("doctor directory returns defensive copies", () => {
  const doctors = listDoctors();

  doctors[0].name = "Changed Doctor";
  doctors[0].treatments.push("fake treatment");

  const freshDoctors = listDoctors();

  assert.equal(freshDoctors[0].name, "Dr. Ayşe Demir");
  assert.equal(freshDoctors[0].treatments.includes("fake treatment"), false);
});

test("getDoctorById returns a single doctor or null", () => {
  const doctor = getDoctorById("dr-emre-kaya");
  const missingDoctor = getDoctorById("missing-doctor");

  assert.equal(doctor.name, "Dr. Emre Kaya");
  assert.equal(missingDoctor, null);
});

test("resolveTreatmentName supports Turkish aliases and ascii input", () => {
  assert.equal(resolveTreatmentName("implant için doktor"), "implant");
  assert.equal(resolveTreatmentName("dis tasi temizligi"), "diş taşı temizliği");
  assert.equal(resolveTreatmentName("şeffaf plak"), "ortodonti");
  assert.equal(resolveTreatmentName("bilinmeyen işlem"), null);
});

test("findDoctorsByTreatment maps implant to the implant doctor", () => {
  const doctors = findDoctorsByTreatment("implant");

  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].name, "Dr. Ayşe Demir");
  assert.ok(doctors[0].treatments.includes("implant"));
});

test("findDoctorsByTreatment maps cleaning aliases to periodontology doctor", () => {
  const doctors = findDoctorsByTreatment("dis tasi");

  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].name, "Dr. Zeynep Arslan");
  assert.ok(doctors[0].treatments.includes("diş taşı temizliği"));
});

test("doctorHandlesTreatment validates a doctor's supported treatments", () => {
  const doctor = getDoctorById("dr-mert-yilmaz");

  assert.equal(doctorHandlesTreatment(doctor, "ortodonti"), true);
  assert.equal(doctorHandlesTreatment(doctor, "implant"), false);
});

test("findDoctorsByMessage detects treatment need from patient-style question", () => {
  const doctors = findDoctorsByMessage("Hangi doktor kanal tedavisi yapıyor?");

  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].name, "Dr. Emre Kaya");
});

test("formatDoctorForPatient creates a readable safe doctor summary", () => {
  const doctor = getDoctorById("dr-ayse-demir");
  const summary = formatDoctorForPatient(doctor);

  assert.match(summary, /Dr. Ayşe Demir/);
  assert.match(summary, /Mock çalışma günleri/);
  assert.doesNotMatch(summary, /TL|₺|indirim|kampanya/i);
});

test("createDoctorDirectoryReply includes mock warning and does not invent availability", () => {
  const reply = createDoctorDirectoryReply("İmplant için hangi doktor bakıyor?");

  assert.match(reply, /implant için ilgili doktor bilgisi/);
  assert.match(reply, /Dr. Ayşe Demir/);
  assert.match(reply, /gerçek müsait saat/);
  assert.match(reply, /sekreter veya takvim sistemi/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
});
