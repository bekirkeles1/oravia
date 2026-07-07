const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTreatmentAnswer,
  getTreatmentKnowledge,
  listTreatmentKnowledge,
  searchTreatmentKnowledge
} = require("../src/clinic/treatmentKnowledgeBase");

test("lists controlled dental treatment knowledge entries", () => {
  const treatments = listTreatmentKnowledge();

  assert.equal(treatments.length, 8);
  assert.deepEqual(
    treatments.map((treatment) => treatment.id),
    [
      "implant",
      "dental_cleaning",
      "teeth_whitening",
      "root_canal",
      "filling",
      "tooth_extraction",
      "orthodontics",
      "general_examination"
    ]
  );
});

test("gets implant knowledge by id and Turkish alias", () => {
  const byId = getTreatmentKnowledge("implant");
  const byAlias = getTreatmentKnowledge("diş implantı");

  assert.equal(byId.display_name, "İmplant");
  assert.equal(byAlias.id, "implant");
  assert.equal(byId.requires_examination, true);
});

test("searches treatment knowledge from a patient message", () => {
  const result = searchTreatmentKnowledge(
    "Merhaba, diş taşı temizliği için bilgi almak istiyorum."
  );

  assert.equal(result.id, "dental_cleaning");
  assert.equal(result.display_name, "Diş taşı temizliği");
  assert.equal(result.routine_interval_months, 12);
});

test("builds a safe treatment answer with next action", () => {
  const treatment = getTreatmentKnowledge("implant");
  const answer = buildTreatmentAnswer(treatment);

  assert.match(answer, /eksik dişlerin yerine/);
  assert.match(answer, /hekim muayenesi/);
  assert.match(answer, /uygun randevu saatlerini kontrol edebilirim/);
});

test("returns null for unknown treatment", () => {
  assert.equal(getTreatmentKnowledge("botoks"), null);
  assert.equal(searchTreatmentKnowledge("Merhaba, fiyat listesini atar mısınız?"), null);
  assert.equal(buildTreatmentAnswer(null), null);
});

test("returns defensive copies so callers cannot mutate source knowledge", () => {
  const first = getTreatmentKnowledge("implant");
  first.aliases.push("mutated-alias");
  first.common_questions[0].answer = "mutated answer";

  const second = getTreatmentKnowledge("implant");

  assert.equal(second.aliases.includes("mutated-alias"), false);
  assert.notEqual(second.common_questions[0].answer, "mutated answer");
});
