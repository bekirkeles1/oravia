const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDoctorAvailabilityReply,
  findAvailableDoctorsByTreatmentAndDay,
  findDayInMessage,
  formatAvailabilityWindows,
  formatDoctorDayAvailability,
  getAvailabilityByDoctorId,
  getAvailabilityForDoctorDay,
  hasValidAvailabilityWindows,
  isDoctorAvailableOnDay,
  isValidTime,
  listDoctorAvailability,
  resolveDayName,
  timeToMinutes,
  validateAvailabilityWindow,
} = require("../src/clinic/doctorAvailability");

test("doctor availability exposes mock weekly schedules for doctors", () => {
  const availability = listDoctorAvailability();

  assert.equal(availability.length, 4);
  assert.ok(availability.every((item) => item.doctorId));
  assert.ok(availability.every((item) => item.source === "mock"));
  assert.ok(availability.every((item) => item.weeklyAvailability.length === 7));
});

test("doctor availability returns defensive copies", () => {
  const availability = listDoctorAvailability();

  availability[0].doctorId = "changed-doctor";
  availability[0].weeklyAvailability[0].windows.push({
    start: "00:00",
    end: "23:59",
  });

  const freshAvailability = listDoctorAvailability();

  assert.equal(freshAvailability[0].doctorId, "dr-ayse-demir");
  assert.equal(freshAvailability[0].weeklyAvailability[0].windows.length, 2);
});

test("resolveDayName supports Turkish and English day names", () => {
  assert.equal(resolveDayName("Pazartesi"), "monday");
  assert.equal(resolveDayName("çarşamba"), "wednesday");
  assert.equal(resolveDayName("cumartesi"), "saturday");
  assert.equal(resolveDayName("Sunday"), "sunday");
  assert.equal(resolveDayName("bilinmeyen gün"), null);
});

test("findDayInMessage detects day names inside patient messages", () => {
  assert.equal(
    findDayInMessage("İmplant için çarşamba müsait doktor var mı?"),
    "wednesday"
  );
  assert.equal(findDayInMessage("Cumartesi diş taşı temizliği olur mu?"), "saturday");
  assert.equal(findDayInMessage("İmplant için doktor var mı?"), null);
});

test("time helpers validate time format and ordering", () => {
  assert.equal(isValidTime("09:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("9:00"), false);

  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("invalid"), null);

  assert.equal(
    validateAvailabilityWindow({ start: "09:00", end: "10:00" }),
    true
  );
  assert.equal(
    validateAvailabilityWindow({ start: "10:00", end: "09:00" }),
    false
  );
  assert.equal(
    validateAvailabilityWindow({ start: "10:00", end: "10:00" }),
    false
  );
});

test("getAvailabilityByDoctorId returns one doctor's weekly schedule or null", () => {
  const availability = getAvailabilityByDoctorId("dr-ayse-demir");
  const missingAvailability = getAvailabilityByDoctorId("missing-doctor");

  assert.equal(availability.doctorId, "dr-ayse-demir");
  assert.equal(availability.weeklyAvailability.length, 7);
  assert.equal(missingAvailability, null);
});

test("getAvailabilityForDoctorDay returns a doctor's day availability", () => {
  const wednesday = getAvailabilityForDoctorDay("dr-ayse-demir", "Çarşamba");
  const sunday = getAvailabilityForDoctorDay("dr-ayse-demir", "Pazar");

  assert.equal(wednesday.day, "wednesday");
  assert.equal(wednesday.enabled, true);
  assert.equal(wednesday.windows.length, 2);

  assert.equal(sunday.day, "sunday");
  assert.equal(sunday.enabled, false);
  assert.equal(sunday.windows.length, 0);
});

test("availability checks only count enabled days with valid time windows", () => {
  const wednesday = getAvailabilityForDoctorDay("dr-ayse-demir", "Çarşamba");
  const sunday = getAvailabilityForDoctorDay("dr-ayse-demir", "Pazar");

  assert.equal(hasValidAvailabilityWindows(wednesday), true);
  assert.equal(hasValidAvailabilityWindows(sunday), false);
  assert.equal(isDoctorAvailableOnDay("dr-ayse-demir", "Çarşamba"), true);
  assert.equal(isDoctorAvailableOnDay("dr-ayse-demir", "Salı"), false);
});

test("findAvailableDoctorsByTreatmentAndDay maps treatment and day to available doctors", () => {
  const implantWednesday = findAvailableDoctorsByTreatmentAndDay(
    "implant",
    "Çarşamba"
  );
  const implantTuesday = findAvailableDoctorsByTreatmentAndDay(
    "implant",
    "Salı"
  );
  const cleaningSaturday = findAvailableDoctorsByTreatmentAndDay(
    "diş taşı temizliği",
    "Cumartesi"
  );

  assert.equal(implantWednesday.length, 1);
  assert.equal(implantWednesday[0].doctor.name, "Dr. Ayşe Demir");
  assert.equal(implantWednesday[0].day, "wednesday");
  assert.equal(implantWednesday[0].source, "mock");

  assert.equal(implantTuesday.length, 0);

  assert.equal(cleaningSaturday.length, 1);
  assert.equal(cleaningSaturday[0].doctor.name, "Dr. Zeynep Arslan");
});

test("format helpers produce safe patient-facing schedule text", () => {
  const windowsText = formatAvailabilityWindows([
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]);
  const doctorDayText = formatDoctorDayAvailability(
    "dr-ayse-demir",
    "Çarşamba"
  );

  assert.equal(windowsText, "09:00-12:00, 13:00-17:00");
  assert.match(doctorDayText, /Dr. Ayşe Demir/);
  assert.match(doctorDayText, /Çarşamba/);
  assert.match(doctorDayText, /mock programa göre/);
  assert.doesNotMatch(doctorDayText, /randevunuz oluşturuldu/i);
});

test("createDoctorAvailabilityReply answers treatment and day questions without creating appointments", () => {
  const reply = createDoctorAvailabilityReply(
    "İmplant için çarşamba müsait doktor var mı?"
  );

  assert.match(reply, /implant için Çarşamba günü/);
  assert.match(reply, /Dr. Ayşe Demir/);
  assert.match(reply, /takvim çakışması/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
  assert.doesNotMatch(reply, /TL|₺|indirim|kampanya/i);
});

test("createDoctorAvailabilityReply returns a safe no-availability message", () => {
  const reply = createDoctorAvailabilityReply(
    "İmplant için salı müsait doktor var mı?"
  );

  assert.match(reply, /implant için Salı günü/);
  assert.match(reply, /uygun doktor görünmüyor/);
  assert.match(reply, /sekreter veya takvim kontrolü/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
});

test("createDoctorAvailabilityReply can summarize treatment schedule when no day is given", () => {
  const reply = createDoctorAvailabilityReply("Kanal tedavisi için doktor var mı?");

  assert.match(reply, /kanal tedavisi için mock doktor çalışma programı/);
  assert.match(reply, /Dr. Emre Kaya/);
  assert.match(reply, /Pazartesi/);
  assert.match(reply, /Perşembe/);
  assert.match(reply, /gerçek randevu oluşturmadan önce/);
});
