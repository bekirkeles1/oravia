const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyPatientMessage } = require("../src/ai/intentClassifier");

test("classifies the Sprint 2 sample appointment request", () => {
  const result = classifyPatientMessage(
    "Merhaba, implant için randevu almak istiyorum."
  );

  assert.equal(result.intent, "appointment_request");
  assert.equal(result.confidence, 0.9);
  assert.equal(result.requires_handoff, false);
  assert.equal(result.extracted_data.treatment_interest, "implant");
  assert.equal(result.extracted_data.preferred_day, null);
  assert.equal(result.extracted_data.preferred_time, null);
  assert.equal(result.extracted_data.patient_name, null);
  assert.ok(result.reply.toLocaleLowerCase("tr-TR").includes("implant"));
});
