const TREATMENTS = [
  {
    id: "implant",
    display_name: "İmplant",
    aliases: ["implant", "diş implantı", "implant tedavisi"],
    short_answer:
      "İmplant, eksik dişlerin yerine çene kemiğine yerleştirilen yapay diş kökü uygulamasıdır.",
    common_questions: [
      {
        question: "İmplant acıtır mı?",
        answer:
          "İmplant işlemi genellikle lokal anestezi altında yapılır. İşlem sırasında ağrı beklenmez, işlem sonrasında hafif hassasiyet olabilir."
      },
      {
        question: "İmplant ne kadar sürer?",
        answer:
          "Süre; kemik yapısı, ek işlem ihtiyacı ve tedavi planına göre değişir. Net süre için hekim muayenesi gerekir."
      }
    ],
    safety_note: "İmplant uygunluğu için hekim muayenesi ve radyolojik değerlendirme gerekir.",
    recommended_next_action:
      "İsterseniz implant muayenesi için uygun randevu saatlerini kontrol edebilirim.",
    requires_examination: true
  },
  {
    id: "dental_cleaning",
    display_name: "Diş taşı temizliği",
    aliases: ["diş taşı", "diş taşı temizliği", "temizlik", "detartraj"],
    short_answer:
      "Diş taşı temizliği, diş yüzeyinde ve diş eti çevresinde biriken sert plakların hekim tarafından temizlenmesi işlemidir.",
    common_questions: [
      {
        question: "Diş taşı temizliği ne sıklıkla yapılmalı?",
        answer:
          "Genel olarak yılda bir kontrol önerilir. Ancak ihtiyaç kişiden kişiye değişebilir."
      },
      {
        question: "Diş taşı temizliği dişe zarar verir mi?",
        answer:
          "Doğru şekilde yapıldığında diş taşı temizliği dişe zarar vermez; diş eti sağlığını korumaya yardımcı olur."
      }
    ],
    safety_note:
      "Diş eti kanaması, hassasiyet veya ileri diş eti problemi varsa hekim değerlendirmesi gerekir.",
    recommended_next_action:
      "İsterseniz diş taşı temizliği için uygun randevu saatlerini kontrol edebilirim.",
    requires_examination: false,
    routine_interval_months: 12
  },
  {
    id: "teeth_whitening",
    display_name: "Diş beyazlatma",
    aliases: ["diş beyazlatma", "beyazlatma", "bleaching"],
    short_answer:
      "Diş beyazlatma, diş rengini açmaya yönelik estetik bir uygulamadır.",
    common_questions: [
      {
        question: "Diş beyazlatma kalıcı mı?",
        answer:
          "Kalıcılık; beslenme, sigara, kahve/çay tüketimi ve ağız bakımına göre değişir."
      }
    ],
    safety_note:
      "Diş hassasiyeti, çürük veya diş eti problemi varsa beyazlatma öncesi hekim kontrolü gerekir.",
    recommended_next_action:
      "İsterseniz diş beyazlatma uygunluğu için muayene randevusu oluşturmanıza yardımcı olabilirim.",
    requires_examination: true
  },
  {
    id: "root_canal",
    display_name: "Kanal tedavisi",
    aliases: ["kanal tedavisi", "kanal", "endodonti"],
    short_answer:
      "Kanal tedavisi, dişin iç kısmındaki enfekte veya hasarlı dokunun temizlenip dişin korunmasını amaçlayan bir tedavidir.",
    common_questions: [
      {
        question: "Kanal tedavisi ağrılı mı?",
        answer:
          "Tedavi genellikle lokal anestezi ile yapılır. Ağrı kontrolü sağlanır, işlem sonrasında hassasiyet olabilir."
      }
    ],
    safety_note:
      "Şiddetli ağrı, şişlik veya enfeksiyon belirtisi varsa klinik ekibi tarafından değerlendirilmelidir.",
    recommended_next_action:
      "İsterseniz kanal tedavisi değerlendirmesi için uygun muayene saatlerini kontrol edebilirim.",
    requires_examination: true
  },
  {
    id: "filling",
    display_name: "Dolgu",
    aliases: ["dolgu", "diş dolgusu"],
    short_answer:
      "Dolgu, çürük veya hasar görmüş diş dokusunun temizlenip uygun materyalle onarılması işlemidir.",
    common_questions: [
      {
        question: "Dolgu ne kadar sürer?",
        answer:
          "Dolgu süresi dişteki hasarın durumuna göre değişir. Net süre muayene sonrası belirlenir."
      }
    ],
    safety_note:
      "Çürüğün derinliği ve dişin durumu muayene ile değerlendirilmelidir.",
    recommended_next_action:
      "İsterseniz dolgu muayenesi için uygun randevu saatlerini kontrol edebilirim.",
    requires_examination: true
  },
  {
    id: "tooth_extraction",
    display_name: "Diş çekimi",
    aliases: ["diş çekimi", "çekim", "diş çektirme"],
    short_answer:
      "Diş çekimi, korunması mümkün olmayan veya çekilmesi gereken dişin hekim tarafından alınması işlemidir.",
    common_questions: [
      {
        question: "Diş çekimi sonrası nelere dikkat edilmeli?",
        answer:
          "Genel bakım önerileri hekimin işlem sonrası yönlendirmesine göre yapılmalıdır. Kanama, şiddetli ağrı veya şişlikte klinikle iletişime geçilmelidir."
      }
    ],
    safety_note:
      "Diş çekimi kararı yalnızca hekim muayenesi sonrası verilmelidir.",
    recommended_next_action:
      "İsterseniz diş çekimi değerlendirmesi için uygun muayene saatlerini kontrol edebilirim.",
    requires_examination: true
  },
  {
    id: "orthodontics",
    display_name: "Ortodonti",
    aliases: ["ortodonti", "tel tedavisi", "diş teli"],
    short_answer:
      "Ortodonti, diş ve çene dizilim bozukluklarının değerlendirilip tedavi edilmesini amaçlayan alandır.",
    common_questions: [
      {
        question: "Ortodonti tedavisi ne kadar sürer?",
        answer:
          "Tedavi süresi dişlerin ve çene yapısının durumuna göre değişir. Net süre ortodonti muayenesi sonrası belirlenir."
      }
    ],
    safety_note:
      "Ortodonti uygunluğu ve tedavi planı hekim muayenesi ile belirlenmelidir.",
    recommended_next_action:
      "İsterseniz ortodonti muayenesi için uygun randevu saatlerini kontrol edebilirim.",
    requires_examination: true
  },
  {
    id: "general_examination",
    display_name: "Genel muayene",
    aliases: ["muayene", "genel muayene", "kontrol"],
    short_answer:
      "Genel muayene, ağız ve diş sağlığının hekim tarafından değerlendirilmesidir.",
    common_questions: [
      {
        question: "Muayenede ne yapılır?",
        answer:
          "Hekim ağız ve diş sağlığını değerlendirir, gerekli görürse görüntüleme veya ek tedavi planı önerebilir."
      }
    ],
    safety_note:
      "Net tedavi planı muayene sonrası belirlenir.",
    recommended_next_action:
      "İsterseniz genel muayene için uygun randevu saatlerini kontrol edebilirim.",
    requires_examination: true
  }
];

function listTreatmentKnowledge() {
  return TREATMENTS.map(cloneTreatment);
}

function getTreatmentKnowledge(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  const treatment = TREATMENTS.find((item) => {
    if (normalizeText(item.id) === normalizedValue) {
      return true;
    }

    if (normalizeText(item.display_name) === normalizedValue) {
      return true;
    }

    return item.aliases.some((alias) => normalizeText(alias) === normalizedValue);
  });

  return treatment ? cloneTreatment(treatment) : null;
}

function searchTreatmentKnowledge(message) {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) {
    return null;
  }

  const treatment = TREATMENTS.find((item) => {
    return item.aliases.some((alias) => normalizedMessage.includes(normalizeText(alias)));
  });

  return treatment ? cloneTreatment(treatment) : null;
}

function buildTreatmentAnswer(treatment) {
  if (!treatment) {
    return null;
  }

  return [
    treatment.short_answer,
    treatment.safety_note,
    treatment.recommended_next_action
  ].join(" ");
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cloneTreatment(treatment) {
  return {
    ...treatment,
    aliases: [...treatment.aliases],
    common_questions: treatment.common_questions.map((item) => ({ ...item }))
  };
}

module.exports = {
  buildTreatmentAnswer,
  getTreatmentKnowledge,
  listTreatmentKnowledge,
  searchTreatmentKnowledge
};
