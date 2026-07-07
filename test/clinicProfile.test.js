const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createClinicProfileReply,
  findWorkingHoursByDay,
  formatAddress,
  formatWorkingHours,
  getClinicContactInfo,
  getClinicProfile,
  isClinicProfileQuestion,
} = require("../src/clinic/clinicProfile");

test("clinic profile exposes safe mock clinic identity", () => {
  const profile = getClinicProfile();

  assert.equal(profile.source, "mock");
  assert.equal(profile.name, "Oravia Demo Dental Clinic");
  assert.equal(profile.phone, "+90 212 000 00 00");
  assert.ok(profile.safetyNotes.includes("Gerçek adres, telefon veya hasta verisi içermez."));
  assert.ok(profile.safetyNotes.includes("Fiyat bilgisi içermez."));
});

test("clinic profile returns defensive copies", () => {
  const profile = getClinicProfile();

  profile.name = "Changed Clinic";
  profile.address.city = "Changed City";

  const freshProfile = getClinicProfile();

  assert.equal(freshProfile.name, "Oravia Demo Dental Clinic");
  assert.equal(freshProfile.address.city, "İstanbul");
});

test("clinic contact info formats address and transportation notes", () => {
  const contactInfo = getClinicContactInfo();

  assert.equal(contactInfo.source, "mock");
  assert.match(contactInfo.addressText, /Demo Mahallesi/);
  assert.match(contactInfo.addressText, /İstanbul/);
  assert.ok(contactInfo.transportationNotes.length > 0);
  assert.match(contactInfo.parkingNote, /Mock bilgi/);
});

test("formatAddress joins address fields safely", () => {
  const addressText = formatAddress({
    line: "Test Sokak No: 1",
    district: "Beşiktaş",
    city: "İstanbul",
    country: "Türkiye",
  });

  assert.equal(addressText, "Test Sokak No: 1, Beşiktaş, İstanbul, Türkiye");
});

test("formatWorkingHours includes open and closed days", () => {
  const workingHoursText = formatWorkingHours();

  assert.match(workingHoursText, /Pazartesi: 09:00-18:00/);
  assert.match(workingHoursText, /Cumartesi: 10:00-15:00/);
  assert.match(workingHoursText, /Pazar: Kapalı/);
});

test("findWorkingHoursByDay supports Turkish day names", () => {
  const saturday = findWorkingHoursByDay("cumartesi");
  const sunday = findWorkingHoursByDay("Pazar");

  assert.equal(saturday.opensAt, "10:00");
  assert.equal(saturday.closesAt, "15:00");
  assert.equal(sunday.isClosed, true);
});

test("clinic profile question detection catches address and hours", () => {
  assert.equal(isClinicProfileQuestion("Klinik adresiniz nerede?"), true);
  assert.equal(isClinicProfileQuestion("Kaçta açıksınız?"), true);
  assert.equal(isClinicProfileQuestion("Otopark var mı?"), true);
  assert.equal(isClinicProfileQuestion("İmplant acıtır mı?"), false);
});

test("createClinicProfileReply returns safe clinic answers without price or availability promises", () => {
  const addressReply = createClinicProfileReply("Klinik adresiniz nerede?");
  const hoursReply = createClinicProfileReply("Çalışma saatleriniz nedir?");

  assert.match(addressReply, /Oravia Demo Dental Clinic adresi/);
  assert.match(addressReply, /mock kabul edilmelidir/);
  assert.match(hoursReply, /Çalışma saatlerimiz/);
  assert.match(hoursReply, /Pazar: Kapalı/);
  assert.doesNotMatch(addressReply, /TL|₺|indirim|kampanya/i);
});
