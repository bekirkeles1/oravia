const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildSlotId,
  createSlotProposalReply,
  generateSlotProposals,
  generateSlotsFromWindow,
  minutesToTime,
} = require("../src/messaging/slotProposal");

test("minutesToTime formats valid minute values", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(570), "09:30");
  assert.equal(minutesToTime(23 * 60 + 59), "23:59");
  assert.equal(minutesToTime(-1), null);
  assert.equal(minutesToTime(24 * 60), null);
});

test("generateSlotsFromWindow creates duration-sized mock slots by default", () => {
  const slots = generateSlotsFromWindow({
    start: "10:00",
    end: "11:30",
  });

  assert.deepEqual(
    slots.map((slot) => slot.time),
    ["10:00", "10:30", "11:00"]
  );
  assert.ok(slots.every((slot) => slot.durationMinutes === 30));
  assert.ok(slots.every((slot) => slot.source === "mock"));
  assert.ok(slots.every((slot) => slot.requires_calendar_conflict_check));
});

test("generateSlotsFromWindow respects duration, step, and max slot options", () => {
  const slots = generateSlotsFromWindow(
    {
      start: "09:00",
      end: "12:00",
    },
    {
      durationMinutes: 60,
      stepMinutes: 30,
      maxSlots: 2,
    }
  );

  assert.deepEqual(
    slots.map((slot) => slot.time),
    ["09:00", "09:30"]
  );
  assert.ok(slots.every((slot) => slot.durationMinutes === 60));
});

test("generateSlotsFromWindow rejects invalid windows", () => {
  assert.deepEqual(generateSlotsFromWindow({ start: "11:00", end: "10:00" }), []);
  assert.deepEqual(generateSlotsFromWindow({ start: "bad", end: "10:00" }), []);
});

test("buildSlotId creates stable mock slot ids with appointment purpose", () => {
  const id = buildSlotId({
    doctorId: "dr-ayse-demir",
    treatment: "diş taşı temizliği",
    appointmentPurpose: "initial_consultation",
    day: "wednesday",
    time: "10:30",
    durationMinutes: 60,
  });

  assert.equal(
    id,
    "dr-ayse-demir-dis-tasi-temizligi-initial-consultation-wednesday-1030-60m"
  );
});

test("generateSlotProposals defaults first-time implant request to consultation slots", () => {
  const result = generateSlotProposals({
    message: "İmplant yaptırmak istiyorum, çarşamba müsait slot var mı?",
    maxSlots: 3,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.source, "mock");
  assert.equal(result.treatment, "implant");
  assert.equal(result.appointmentPurpose, "initial_consultation");
  assert.equal(result.durationMinutes, 30);
  assert.equal(result.day, "wednesday");
  assert.equal(result.proposals.length, 3);

  assert.deepEqual(
    result.proposals.map((proposal) => proposal.time),
    ["10:00", "10:30", "11:00"]
  );
  assert.ok(
    result.proposals.every((proposal) => proposal.durationMinutes === 30)
  );
  assert.ok(
    result.proposals.every((proposal) => proposal.doctorName === "Dr. Ayşe Demir")
  );
  assert.ok(
    result.proposals.every(
      (proposal) => proposal.requires_calendar_conflict_check === true
    )
  );
});

test("generateSlotProposals uses procedure duration only when explicitly requested", () => {
  const result = generateSlotProposals({
    treatmentName: "implant",
    dayName: "Çarşamba",
    appointmentPurpose: "procedure",
    maxSlots: 3,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.treatment, "implant");
  assert.equal(result.appointmentPurpose, "procedure");
  assert.equal(result.durationMinutes, 120);

  assert.deepEqual(
    result.proposals.map((proposal) => proposal.time),
    ["10:00", "14:00", "16:00"]
  );
  assert.ok(
    result.proposals.every((proposal) => proposal.durationMinutes === 120)
  );
});

test("generateSlotProposals can use explicit treatment and day inputs", () => {
  const result = generateSlotProposals({
    treatmentName: "diş taşı temizliği",
    dayName: "Cumartesi",
    maxSlots: 2,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.treatment, "diş taşı temizliği");
  assert.equal(result.appointmentPurpose, "initial_consultation");
  assert.equal(result.day, "saturday");
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.proposals.length, 2);
  assert.equal(result.proposals[0].doctorName, "Dr. Zeynep Arslan");
  assert.equal(result.proposals[0].time, "10:00");
  assert.equal(result.proposals[1].time, "11:00");
});

test("generateSlotProposals returns missing context when treatment or day is absent", () => {
  const missingDay = generateSlotProposals({
    message: "İmplant için slot var mı?",
  });
  const missingTreatment = generateSlotProposals({
    message: "Çarşamba slot var mı?",
  });

  assert.equal(missingDay.status, "missing_context");
  assert.equal(missingDay.treatment, "implant");
  assert.equal(missingDay.day, null);
  assert.equal(missingDay.appointmentPurpose, "initial_consultation");
  assert.deepEqual(missingDay.proposals, []);

  assert.equal(missingTreatment.status, "missing_context");
  assert.equal(missingTreatment.treatment, null);
  assert.equal(missingTreatment.day, "wednesday");
  assert.equal(missingTreatment.appointmentPurpose, "initial_consultation");
  assert.deepEqual(missingTreatment.proposals, []);
});

test("generateSlotProposals returns no_slots when no doctor is available for that day", () => {
  const result = generateSlotProposals({
    message: "İmplant için salı slot var mı?",
  });

  assert.equal(result.status, "no_slots");
  assert.equal(result.treatment, "implant");
  assert.equal(result.day, "tuesday");
  assert.equal(result.appointmentPurpose, "initial_consultation");
  assert.deepEqual(result.proposals, []);
  assert.match(result.safety_note, /takvim çakışması/);
});

test("createSlotProposalReply returns safe patient-facing consultation proposal text", () => {
  const reply = createSlotProposalReply({
    message: "İmplant yaptırmak istiyorum, çarşamba slot önerir misiniz?",
    maxSlots: 3,
  });

  assert.match(reply, /implant için Çarşamba günü mock ilk muayene \/ değerlendirme slot önerileri/);
  assert.match(reply, /1\. Dr\. Ayşe Demir — 10:00 \(30 dk\)/);
  assert.match(reply, /2\. Dr\. Ayşe Demir — 10:30 \(30 dk\)/);
  assert.match(reply, /3\. Dr\. Ayşe Demir — 11:00 \(30 dk\)/);
  assert.match(reply, /kesin randevu değildir/);
  assert.match(reply, /takvim çakışması/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
});

test("createSlotProposalReply returns procedure proposal text only for explicit procedure purpose", () => {
  const reply = createSlotProposalReply({
    treatmentName: "implant",
    dayName: "Çarşamba",
    appointmentPurpose: "procedure",
    maxSlots: 2,
  });

  assert.match(reply, /implant için Çarşamba günü mock tedavi işlemi slot önerileri/);
  assert.match(reply, /1\. Dr\. Ayşe Demir — 10:00 \(120 dk\)/);
  assert.match(reply, /2\. Dr\. Ayşe Demir — 14:00 \(120 dk\)/);
});

test("createSlotProposalReply returns null when required context is missing", () => {
  const reply = createSlotProposalReply({
    message: "Slot var mı?",
  });

  assert.equal(reply, null);
});

test("createSlotProposalReply returns safe no-slot text", () => {
  const reply = createSlotProposalReply({
    message: "İmplant için salı slot var mı?",
  });

  assert.match(reply, /önerilebilir/);
  assert.match(reply, /slotu bulunamadı/);
  assert.match(reply, /sekreter veya takvim kontrolü/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
});

test("generateSlotProposals allows explicit duration override for controlled flows", () => {
  const result = generateSlotProposals({
    message: "İmplant için çarşamba slot var mı?",
    durationMinutes: 45,
    stepMinutes: 45,
    maxSlots: 3,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.proposals.length, 3);
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.time),
    ["10:00", "10:45", "11:30"]
  );
  assert.ok(
    result.proposals.every((proposal) => proposal.durationMinutes === 45)
  );
});
