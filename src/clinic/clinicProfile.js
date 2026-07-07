const CLINIC_PROFILE = {
  id: "oravia-demo-clinic",
  source: "mock",
  name: "Oravia Demo Dental Clinic",
  address: {
    line: "Demo Mahallesi, Sağlık Caddesi No: 10",
    district: "Kadıköy",
    city: "İstanbul",
    country: "Türkiye",
  },
  phone: "+90 212 000 00 00",
  workingHours: [
    {
      day: "monday",
      label: "Pazartesi",
      opensAt: "09:00",
      closesAt: "18:00",
      isClosed: false,
    },
    {
      day: "tuesday",
      label: "Salı",
      opensAt: "09:00",
      closesAt: "18:00",
      isClosed: false,
    },
    {
      day: "wednesday",
      label: "Çarşamba",
      opensAt: "09:00",
      closesAt: "18:00",
      isClosed: false,
    },
    {
      day: "thursday",
      label: "Perşembe",
      opensAt: "09:00",
      closesAt: "18:00",
      isClosed: false,
    },
    {
      day: "friday",
      label: "Cuma",
      opensAt: "09:00",
      closesAt: "18:00",
      isClosed: false,
    },
    {
      day: "saturday",
      label: "Cumartesi",
      opensAt: "10:00",
      closesAt: "15:00",
      isClosed: false,
    },
    {
      day: "sunday",
      label: "Pazar",
      opensAt: null,
      closesAt: null,
      isClosed: true,
    },
  ],
  transportationNotes: [
    "Demo klinik konumu toplu taşımaya yakın olacak şekilde modellenmiştir.",
    "Gerçek ulaşım tarifi bağlanmadan önce klinik tarafından doğrulanmalıdır.",
  ],
  parkingNote:
    "Mock bilgi: Klinik çevresinde sınırlı otopark alanı olduğu varsayılır; hastalara erken gelmeleri önerilebilir.",
  safetyNotes: [
    "Bu profil mock/demo amaçlıdır.",
    "Gerçek adres, telefon veya hasta verisi içermez.",
    "Fiyat bilgisi içermez.",
    "Gerçek müsaitlik bilgisi içermez.",
  ],
};

const DAY_ALIASES = {
  pazartesi: "monday",
  monday: "monday",
  sali: "tuesday",
  salı: "tuesday",
  tuesday: "tuesday",
  carsamba: "wednesday",
  çarsamba: "wednesday",
  çarşamba: "wednesday",
  wednesday: "wednesday",
  persembe: "thursday",
  perşembe: "thursday",
  thursday: "thursday",
  cuma: "friday",
  friday: "friday",
  cumartesi: "saturday",
  saturday: "saturday",
  pazar: "sunday",
  sunday: "sunday",
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

function getClinicProfile() {
  return deepClone(CLINIC_PROFILE);
}

function formatAddress(address = CLINIC_PROFILE.address) {
  return [
    address.line,
    address.district,
    address.city,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function getClinicContactInfo() {
  return {
    name: CLINIC_PROFILE.name,
    addressText: formatAddress(CLINIC_PROFILE.address),
    phone: CLINIC_PROFILE.phone,
    transportationNotes: deepClone(CLINIC_PROFILE.transportationNotes),
    parkingNote: CLINIC_PROFILE.parkingNote,
    source: CLINIC_PROFILE.source,
  };
}

function getWorkingHours() {
  return deepClone(CLINIC_PROFILE.workingHours);
}

function formatWorkingHours() {
  return CLINIC_PROFILE.workingHours
    .map((day) => {
      if (day.isClosed) {
        return `${day.label}: Kapalı`;
      }

      return `${day.label}: ${day.opensAt}-${day.closesAt}`;
    })
    .join("\n");
}

function findWorkingHoursByDay(dayName) {
  const normalizedDayName = normalizeText(dayName);
  const dayKey = DAY_ALIASES[normalizedDayName];

  if (!dayKey) {
    return null;
  }

  const workingDay = CLINIC_PROFILE.workingHours.find(
    (day) => day.day === dayKey
  );

  return workingDay ? deepClone(workingDay) : null;
}

function isClinicProfileQuestion(message) {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) {
    return false;
  }

  return [
    "adres",
    "nerede",
    "konum",
    "telefon",
    "iletisim",
    "ulasim",
    "otopark",
    "park",
    "calisma saati",
    "calisma saatleri",
    "kacta acik",
    "kacta aciliyor",
    "kacta kapaniyor",
    "saat kacta",
    "acik misiniz",
  ].some((keyword) => normalizedMessage.includes(keyword));
}

function createClinicProfileReply(message) {
  const normalizedMessage = normalizeText(message);

  if (!isClinicProfileQuestion(normalizedMessage)) {
    return null;
  }

  if (
    normalizedMessage.includes("adres") ||
    normalizedMessage.includes("nerede") ||
    normalizedMessage.includes("konum")
  ) {
    return `${CLINIC_PROFILE.name} adresi: ${formatAddress(
      CLINIC_PROFILE.address
    )}. Ulaşım bilgisi klinik tarafından doğrulanmış gerçek veriye bağlanmadan önce mock kabul edilmelidir.`;
  }

  if (
    normalizedMessage.includes("telefon") ||
    normalizedMessage.includes("iletisim")
  ) {
    return `${CLINIC_PROFILE.name} telefon numarası: ${CLINIC_PROFILE.phone}.`;
  }

  if (
    normalizedMessage.includes("ulasim") ||
    normalizedMessage.includes("otopark") ||
    normalizedMessage.includes("park")
  ) {
    return `${CLINIC_PROFILE.transportationNotes.join(
      " "
    )} ${CLINIC_PROFILE.parkingNote}`;
  }

  return `Çalışma saatlerimiz:\n${formatWorkingHours()}`;
}

module.exports = {
  createClinicProfileReply,
  findWorkingHoursByDay,
  formatAddress,
  formatWorkingHours,
  getClinicContactInfo,
  getClinicProfile,
  getWorkingHours,
  isClinicProfileQuestion,
  normalizeText,
};
