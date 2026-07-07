const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INITIAL_CONSULTATION,
  PROCEDURE,
  getAppointmentPurposeLabel,
  inferAppointmentPurpose,
  listAppointmentPurposes,
  normalizeAppointmentPurpose,
} = require("../src/clinic/appointmentPurposeRules");

test("lists supported appointment purposes as mock rules", () => {
  const purposes = listAppointmentPurposes();

  assert.equal(purposes.length, 2);
  assert.ok(purposes.every((purpose) => purpose.source === "mock"));
  assert.ok(purposes.some((purpose) => purpose.id === INITIAL_CONSULTATION));
  assert.ok(purposes.some((purpose) => purpose.id === PROCEDURE));
});

test("normalizes appointment purpose values safely", () => {
  assert.equal(normalizeAppointmentPurpose("procedure"), PROCEDURE);
  assert.equal(
    normalizeAppointmentPurpose("initial_consultation"),
    INITIAL_CONSULTATION
  );
  assert.equal(normalizeAppointmentPurpose("unknown"), INITIAL_CONSULTATION);
  assert.equal(normalizeAppointmentPurpose(""), INITIAL_CONSULTATION);
});

test("infers initial consultation by default for WhatsApp-style patient messages", () => {
  assert.equal(
    inferAppointmentPurpose({
      message: "İmplant yaptırmak istiyorum.",
    }),
    INITIAL_CONSULTATION
  );

  assert.equal(
    inferAppointmentPurpose({
      message: "Kanal tedavisi için randevu almak istiyorum.",
    }),
    INITIAL_CONSULTATION
  );
});

test("allows controlled procedure purpose override", () => {
  assert.equal(
    inferAppointmentPurpose({
      message: "İmplant işlemi için randevu planlandı.",
      appointmentPurpose: "procedure",
    }),
    PROCEDURE
  );
});

test("returns patient-facing purpose labels", () => {
  assert.equal(
    getAppointmentPurposeLabel(INITIAL_CONSULTATION),
    "İlk muayene / değerlendirme"
  );
  assert.equal(getAppointmentPurposeLabel(PROCEDURE), "Tedavi işlemi");
});
