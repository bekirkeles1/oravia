const {
  findDoctorsByTreatment,
  getDoctorById,
  resolveTreatmentName,
} = require("./doctorDirectory");

const DAY_LABELS = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

const DAY_ALIASES = {
  pazartesi: "monday",
  monday: "monday",
  sali: "tuesday",
  tuesday: "tuesday",
  carsamba: "wednesday",
  wednesday: "wednesday",
  persembe: "thursday",
  thursday: "thursday",
  cuma: "friday",
  friday: "friday",
  cumartesi: "saturday",
  saturday: "saturday",
  pazar: "sunday",
  sunday: "sunday",
};

const WEEKLY_AVAILABILITY = [
  {
    doctorId: "dr-ayse-demir",
    source: "mock",
    weeklyAvailability: [
      {
        day: "monday",
        enabled: true,
        windows: [
          { start: "09:00", end: "12:30" },
          { start: "13:30", end: "17:00" },
        ],
      },
      {
        day: "tuesday",
        enabled: false,
        windows: [],
      },
      {
        day: "wednesday",
        enabled: true,
        windows: [
          { start: "10:00", end: "13:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
      {
        day: "thursday",
        enabled: false,
        windows: [],
      },
      {
        day: "friday",
        enabled: true,
        windows: [{ start: "09:00", end: "15:00" }],
      },
      {
        day: "saturday",
        enabled: false,
        windows: [],
      },
      {
        day: "sunday",
        enabled: false,
        windows: [],
      },
    ],
  },
  {
    doctorId: "dr-emre-kaya",
    source: "mock",
    weeklyAvailability: [
      {
        day: "monday",
        enabled: true,
        windows: [{ start: "09:30", end: "16:30" }],
      },
      {
        day: "tuesday",
        enabled: true,
        windows: [
          { start: "09:00", end: "12:00" },
          { start: "13:00", end: "18:00" },
        ],
      },
      {
        day: "wednesday",
        enabled: false,
        windows: [],
      },
      {
        day: "thursday",
        enabled: true,
        windows: [{ start: "10:00", end: "17:00" }],
      },
      {
        day: "friday",
        enabled: false,
        windows: [],
      },
      {
        day: "saturday",
        enabled: false,
        windows: [],
      },
      {
        day: "sunday",
        enabled: false,
        windows: [],
      },
    ],
  },
  {
    doctorId: "dr-zeynep-arslan",
    source: "mock",
    weeklyAvailability: [
      {
        day: "monday",
        enabled: false,
        windows: [],
      },
      {
        day: "tuesday",
        enabled: true,
        windows: [{ start: "09:00", end: "14:00" }],
      },
      {
        day: "wednesday",
        enabled: true,
        windows: [{ start: "12:00", end: "18:00" }],
      },
      {
        day: "thursday",
        enabled: false,
        windows: [],
      },
      {
        day: "friday",
        enabled: false,
        windows: [],
      },
      {
        day: "saturday",
        enabled: true,
        windows: [{ start: "10:00", end: "15:00" }],
      },
      {
        day: "sunday",
        enabled: false,
        windows: [],
      },
    ],
  },
  {
    doctorId: "dr-mert-yilmaz",
    source: "mock",
    weeklyAvailability: [
      {
        day: "monday",
        enabled: false,
        windows: [],
      },
      {
        day: "tuesday",
        enabled: true,
        windows: [{ start: "11:00", end: "18:00" }],
      },
      {
        day: "wednesday",
        enabled: false,
        windows: [],
      },
      {
        day: "thursday",
        enabled: true,
        windows: [{ start: "09:00", end: "16:00" }],
      },
      {
        day: "friday",
        enabled: false,
        windows: [],
      },
      {
        day: "saturday",
        enabled: false,
        windows: [],
      },
      {
        day: "sunday",
        enabled: false,
        windows: [],
      },
    ],
  },
];

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

function resolveDayName(input) {
  const normalizedInput = normalizeText(input);

  if (!normalizedInput) {
    return null;
  }

  if (DAY_ALIASES[normalizedInput]) {
    return DAY_ALIASES[normalizedInput];
  }

  return (
    Object.entries(DAY_ALIASES)
      .sort(([leftAlias], [rightAlias]) => rightAlias.length - leftAlias.length)
      .find(([alias]) => normalizedInput.includes(alias))?.[1] || null
  );
}

function findDayInMessage(message) {
  return resolveDayName(message);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function timeToMinutes(value) {
  if (!isValidTime(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validateAvailabilityWindow(window) {
  if (!window || typeof window !== "object") {
    return false;
  }

  if (!isValidTime(window.start) || !isValidTime(window.end)) {
    return false;
  }

  return timeToMinutes(window.start) < timeToMinutes(window.end);
}

function hasValidAvailabilityWindows(dayAvailability) {
  if (!dayAvailability || !dayAvailability.enabled) {
    return false;
  }

  if (!Array.isArray(dayAvailability.windows)) {
    return false;
  }

  return dayAvailability.windows.some((window) =>
    validateAvailabilityWindow(window)
  );
}

function listDoctorAvailability() {
  return deepClone(WEEKLY_AVAILABILITY);
}

function getAvailabilityByDoctorId(doctorId) {
  const availability = WEEKLY_AVAILABILITY.find(
    (item) => item.doctorId === doctorId
  );

  return availability ? deepClone(availability) : null;
}

function getAvailabilityForDoctorDay(doctorId, dayName) {
  const dayKey = resolveDayName(dayName);

  if (!dayKey) {
    return null;
  }

  const doctorAvailability = getAvailabilityByDoctorId(doctorId);

  if (!doctorAvailability) {
    return null;
  }

  const dayAvailability = doctorAvailability.weeklyAvailability.find(
    (item) => item.day === dayKey
  );

  return dayAvailability ? deepClone(dayAvailability) : null;
}

function isDoctorAvailableOnDay(doctorId, dayName) {
  const dayAvailability = getAvailabilityForDoctorDay(doctorId, dayName);
  return hasValidAvailabilityWindows(dayAvailability);
}

function formatAvailabilityWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return "müsait saat aralığı yok";
  }

  return windows
    .filter((window) => validateAvailabilityWindow(window))
    .map((window) => `${window.start}-${window.end}`)
    .join(", ");
}

function formatDoctorDayAvailability(doctorId, dayName) {
  const doctor = getDoctorById(doctorId);
  const dayKey = resolveDayName(dayName);
  const dayAvailability = getAvailabilityForDoctorDay(doctorId, dayName);

  if (!doctor || !dayKey || !dayAvailability) {
    return null;
  }

  if (!hasValidAvailabilityWindows(dayAvailability)) {
    return `${doctor.name} ${DAY_LABELS[dayKey]} günü mock programa göre çalışmıyor.`;
  }

  return `${doctor.name} ${DAY_LABELS[dayKey]} günü mock programa göre ${formatAvailabilityWindows(
    dayAvailability.windows
  )} aralıklarında uygun görünüyor.`;
}

function findAvailableDoctorsByTreatmentAndDay(treatmentName, dayName) {
  const resolvedTreatmentName = resolveTreatmentName(treatmentName);
  const dayKey = resolveDayName(dayName);

  if (!resolvedTreatmentName || !dayKey) {
    return [];
  }

  const doctors = findDoctorsByTreatment(resolvedTreatmentName);

  return doctors
    .map((doctor) => {
      const dayAvailability = getAvailabilityForDoctorDay(doctor.id, dayKey);

      if (!hasValidAvailabilityWindows(dayAvailability)) {
        return null;
      }

      return {
        doctor,
        treatment: resolvedTreatmentName,
        day: dayKey,
        dayLabel: DAY_LABELS[dayKey],
        windows: deepClone(dayAvailability.windows),
        source: "mock",
      };
    })
    .filter(Boolean);
}

function createDoctorAvailabilityReply(message) {
  const resolvedTreatmentName = resolveTreatmentName(message);

  if (!resolvedTreatmentName) {
    return null;
  }

  const dayKey = findDayInMessage(message);

  if (dayKey) {
    const matches = findAvailableDoctorsByTreatmentAndDay(
      resolvedTreatmentName,
      dayKey
    );

    if (matches.length === 0) {
      return `${resolvedTreatmentName} için ${DAY_LABELS[dayKey]} günü mock programa göre uygun doktor görünmüyor. Gerçek müsaitlik için sekreter veya takvim kontrolü gerekir.`;
    }

    return [
      `${resolvedTreatmentName} için ${DAY_LABELS[dayKey]} günü mock programa göre uygun doktorlar:`,
      ...matches.map(
        (match) =>
          `${match.doctor.name}: ${formatAvailabilityWindows(match.windows)}`
      ),
      "Bu bilgi mock çalışma programından gelir; gerçek randevu oluşturmadan önce takvim çakışması ayrıca kontrol edilmelidir.",
    ].join("\n");
  }

  const doctors = findDoctorsByTreatment(resolvedTreatmentName);

  if (doctors.length === 0) {
    return null;
  }

  const doctorLines = doctors.map((doctor) => {
    const availability = getAvailabilityByDoctorId(doctor.id);
    const enabledDays = availability.weeklyAvailability
      .filter((dayAvailability) =>
        hasValidAvailabilityWindows(dayAvailability)
      )
      .map(
        (dayAvailability) =>
          `${DAY_LABELS[dayAvailability.day]} ${formatAvailabilityWindows(
            dayAvailability.windows
          )}`
      );

    return `${doctor.name}: ${enabledDays.join("; ")}`;
  });

  return [
    `${resolvedTreatmentName} için mock doktor çalışma programı:`,
    ...doctorLines,
    "Bu bilgi mock çalışma programından gelir; gerçek randevu oluşturmadan önce takvim çakışması ayrıca kontrol edilmelidir.",
  ].join("\n");
}

module.exports = {
  createDoctorAvailabilityReply,
  findAvailableDoctorsByTreatmentAndDay,
  findDayInMessage,
  formatAvailabilityWindows,
  formatDoctorDayAvailability,
  getAvailabilityByDoctorId,
  getAvailabilityForDoctorDay,
  hasValidAvailabilityWindows,
  isDoctorAvailableOnDay,
  isValidTime,
  listDoctorAvailability,
  normalizeText,
  resolveDayName,
  timeToMinutes,
  validateAvailabilityWindow,
};
