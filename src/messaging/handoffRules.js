const HANDOFF_RULES = [
  {
    id: "severe_pain",
    reason: "Patient reports severe pain.",
    keywords: ["şiddetli ağrı", "çok ağrıyor", "dayanılmaz ağrı", "ağrıdan duramıyorum"]
  },
  {
    id: "swelling",
    reason: "Patient reports swelling.",
    keywords: ["şişlik", "şişti", "yüzüm şişti", "dişim şişti", "apse"]
  },
  {
    id: "bleeding",
    reason: "Patient reports bleeding.",
    keywords: ["kanama", "kanıyor", "kanadı", "durmayan kan"]
  },
  {
    id: "medication_question",
    reason: "Patient asks medication question.",
    keywords: ["ilaç", "antibiyotik", "ağrı kesici", "hangi ilacı", "ne ilaç"]
  },
  {
    id: "diagnosis_request",
    reason: "Patient asks for diagnosis.",
    keywords: ["neyim var", "teşhis", "tanı", "çürük mü", "iltihap mı"]
  },
  {
    id: "emergency",
    reason: "Patient may need urgent clinical attention.",
    keywords: ["acil", "dayanamıyorum", "çok kötü", "ateşim var"]
  },
  {
    id: "human_requested",
    reason: "Patient requests human contact.",
    keywords: ["sekreter", "doktorla görüşmek", "insanla konuşmak", "beni arayın"]
  }
];

const DEFAULT_HANDOFF_REPLY =
  "Bu durum klinik ekibimizin değerlendirmesini gerektiriyor. Mesajınızı ekibimize aktarıyorum.";

function evaluateHandoff(message, options = {}) {
  const normalizedMessage = normalizeText(message);
  const rules = options.rules || HANDOFF_RULES;

  if (!normalizedMessage) {
    return {
      requires_handoff: false,
      matched_rules: [],
      reply_draft: null
    };
  }

  const matchedRules = rules.filter((rule) =>
    rule.keywords.some((keyword) => normalizedMessage.includes(normalizeText(keyword)))
  );

  if (matchedRules.length === 0) {
    return {
      requires_handoff: false,
      matched_rules: [],
      reply_draft: null
    };
  }

  return {
    requires_handoff: true,
    matched_rules: matchedRules.map((rule) => ({
      id: rule.id,
      reason: rule.reason
    })),
    reply_draft: DEFAULT_HANDOFF_REPLY
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  DEFAULT_HANDOFF_REPLY,
  evaluateHandoff
};
