const DOCTORS = [
  {
    id: "dr-ayse-demir",
    name: "Dr. Ayşe Demir",
    title: "Diş Hekimi",
    specialties: ["İmplantoloji", "Cerrahi yönlendirme", "Genel muayene"],
    treatments: ["implant", "diş çekimi", "genel muayene"],
    mockWorkingDays: ["Pazartesi", "Çarşamba", "Cuma"],
  },
  {
    id: "dr-emre-kaya",
    name: "Dr. Emre Kaya",
    title: "Diş Hekimi",
    specialties: ["Endodonti", "Restoratif diş tedavileri"],
    treatments: ["kanal tedavisi", "dolgu", "genel muayene"],
    mockWorkingDays: ["Pazartesi", "Salı", "Perşembe"],
  },
  {
    id: "dr-zeynep-arslan",
    name: "Dr. Zeynep Arslan",
    title: "Diş Hekimi",
    specialties: ["Periodontoloji", "Koruyucu diş hekimliği"],
    treatments: ["diş taşı temizliği", "diş beyazlatma", "genel muayene"],
    mockWorkingDays: ["Salı", "Çarşamba", "Cumartesi"],
  },
  {
    id: "dr-mert-yilmaz",
    name: "Dr. Mert Yılmaz",
    title: "Ortodonti Uzmanı",
    specialties: ["Ortodonti", "Şeffaf plak değerlendirme"],
    treatments: ["ortodonti", "genel muayene"],
    mockWorkingDays: ["Salı", "Perşembe"],
  },
];

const TREATMENT_ALIASES = {
  implant: ["implant", "implantoloji"],
  "diş taşı temizliği": [
    "diş taşı",
    "dis tasi",
    "detertraj",
    "diş temizliği",
    "dis temizligi",
    "temizlik",
  ],
  "diş beyazlatma": [
    "diş beyazlatma",
    "dis beyazlatma",
    "beyazlatma",
    "bleaching",
  ],
  "kanal tedavisi": ["kanal", "kanal tedavisi", "endodonti"],
  dolgu: ["dolgu", "kompozit dolgu"],
  "diş çekimi": ["diş çekimi", "dis cekimi", "çekim", "cekim"],
  ortodonti: ["ortodonti", "tel tedavisi", "şeffaf plak", "seffaf plak"],
  "genel muayene": ["genel muayene", "muayene", "kontrol"],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function listDoctors() {
  return deepClone(DOCTORS);
}

function getDoctorById(id) {
  const doctor = DOCTORS.find((item) => item.id === id);
  return doctor ? deepClone(doctor) : null;
}

function resolveTreatmentName(input) {
  const normalizedInput = normalizeText(input);

  if (!normalizedInput) {
    return null;
  }

  return (
    Object.entries(TREATMENT_ALIASES).find(([treatmentName, aliases]) => {
      if (normalizeText(treatmentName) === normalizedInput) {
        return true;
      }

      return aliases.some((alias) => normalizedInput.includes(normalizeText(alias)));
    })?.[0] || null
  );
}

function doctorHandlesTreatment(doctor, treatmentName) {
  const resolvedTreatmentName = resolveTreatmentName(treatmentName);

  if (!doctor || !resolvedTreatmentName) {
    return false;
  }

  return doctor.treatments.some(
    (treatment) => normalizeText(treatment) === normalizeText(resolvedTreatmentName)
  );
}

function findDoctorsByTreatment(treatmentName) {
  const resolvedTreatmentName = resolveTreatmentName(treatmentName);

  if (!resolvedTreatmentName) {
    return [];
  }

  return DOCTORS.filter((doctor) =>
    doctorHandlesTreatment(doctor, resolvedTreatmentName)
  ).map((doctor) => deepClone(doctor));
}

function findDoctorsByMessage(message) {
  const resolvedTreatmentName = resolveTreatmentName(message);

  if (!resolvedTreatmentName) {
    return [];
  }

  return findDoctorsByTreatment(resolvedTreatmentName);
}

function formatDoctorForPatient(doctor) {
  if (!doctor) {
    return null;
  }

  return `${doctor.name} — ${doctor.title}. Alanlar: ${doctor.specialties.join(
    ", "
  )}. Mock çalışma günleri: ${doctor.mockWorkingDays.join(", ")}.`;
}

function createDoctorDirectoryReply(message) {
  const resolvedTreatmentName = resolveTreatmentName(message);

  if (!resolvedTreatmentName) {
    return null;
  }

  const doctors = findDoctorsByTreatment(resolvedTreatmentName);

  if (doctors.length === 0) {
    return null;
  }

  const doctorLines = doctors.map((doctor) => formatDoctorForPatient(doctor));

  return [
    `${resolvedTreatmentName} için ilgili doktor bilgisi:`,
    ...doctorLines,
    "Bu bilgi mock doktor dizininden gelir; gerçek müsait saat sekreter veya takvim sistemi tarafından ayrıca kontrol edilmelidir.",
  ].join("\n");
}

module.exports = {
  createDoctorDirectoryReply,
  doctorHandlesTreatment,
  findDoctorsByMessage,
  findDoctorsByTreatment,
  formatDoctorForPatient,
  getDoctorById,
  listDoctors,
  normalizeText,
  resolveTreatmentName,
};
