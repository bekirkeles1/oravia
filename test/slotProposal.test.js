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

test("generateSlotsFromWindow creates 30 minute mock slots by default", () => {
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

test("buildSlotId creates stable mock slot ids", () => {
  const id = buildSlotId({
    doctorId: "dr-ayse-demir",
    treatment: "diş taşı temizliği",
    day: "wednesday",
    time: "10:30",
    durationMinutes: 30,
  });

  assert.equal(id, "dr-ayse-demir-dis-tasi-temizligi-wednesday-1030-30m");
});

test("generateSlotProposals creates doctor-aware proposals from a patient message", () => {
  const result = generateSlotProposals({
    message: "İmplant için çarşamba müsait slot var mı?",
    maxSlots: 3,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.source, "mock");
  assert.equal(result.treatment, "implant");
  assert.equal(result.day, "wednesday");
  assert.equal(result.proposals.length, 3);

  assert.deepEqual(
    result.proposals.map((proposal) => proposal.time),
    ["10:00", "10:30", "11:00"]
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

test("generateSlotProposals can use explicit treatment and day inputs", () => {
  const result = generateSlotProposals({
    treatmentName: "diş taşı temizliği",
    dayName: "Cumartesi",
    maxSlots: 2,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.treatment, "diş taşı temizliği");
  assert.equal(result.day, "saturday");
  assert.equal(result.proposals.length, 2);
  assert.equal(result.proposals[0].doctorName, "Dr. Zeynep Arslan");
  assert.equal(result.proposals[0].time, "10:00");
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
  assert.deepEqual(missingDay.proposals, []);

  assert.equal(missingTreatment.status, "missing_context");
  assert.equal(missingTreatment.treatment, null);
  assert.equal(missingTreatment.day, "wednesday");
  assert.deepEqual(missingTreatment.proposals, []);
});

test("generateSlotProposals returns no_slots when no doctor is available for that day", () => {
  const result = generateSlotProposals({
    message: "İmplant için salı slot var mı?",
  });

  assert.equal(result.status, "no_slots");
  assert.equal(result.treatment, "implant");
  assert.equal(result.day, "tuesday");
  assert.deepEqual(result.proposals, []);
  assert.match(result.safety_note, /takvim çakışması/);
});

test("createSlotProposalReply returns safe patient-facing proposal text", () => {
  const reply = createSlotProposalReply({
    message: "İmplant için çarşamba slot önerir misiniz?",
    maxSlots: 3,
  });

  assert.match(reply, /implant için Çarşamba günü mock slot önerileri/);
  assert.match(reply, /1\. Dr\. Ayşe Demir — 10:00 \(30 dk\)/);
  assert.match(reply, /2\. Dr\. Ayşe Demir — 10:30 \(30 dk\)/);
  assert.match(reply, /3\. Dr\. Ayşe Demir — 11:00 \(30 dk\)/);
  assert.match(reply, /kesin randevu değildir/);
  assert.match(reply, /takvim çakışması/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
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

  assert.match(reply, /önerilebilir slot bulunamadı/);
  assert.match(reply, /sekreter veya takvim kontrolü/);
  assert.doesNotMatch(reply, /randevunuz oluşturuldu/i);
});
