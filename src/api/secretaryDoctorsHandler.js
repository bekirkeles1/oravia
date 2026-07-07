const { getDoctorById, listDoctors } = require("../clinic/doctorDirectory");
const {
  listDoctorAvailability,
  resolveDayName,
  validateAvailabilityWindow,
} = require("../clinic/doctorAvailability");

const DAY_LABELS = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

function createSuccessResponse(payload) {
  return {
    statusCode: 200,
    body: {
      status: "ok",
      source: "mock",
      ...payload,
    },
  };
}

function createErrorResponse(statusCode, code, message) {
  return {
    statusCode,
    body: {
      status: "error",
      source: "mock",
      error: {
        code,
        message,
      },
    },
  };
}

function normalizeDoctorId(value) {
  return String(value || "").trim();
}

function sanitizeAvailabilityWindow(window) {
  return {
    start: String(window.start || "").trim(),
    end: String(window.end || "").trim(),
  };
}

function handleGetSecretaryDoctors() {
  return createSuccessResponse({
    doctors: listDoctors(),
  });
}

function handleGetSecretaryDoctorAvailability() {
  return createSuccessResponse({
    availability: listDoctorAvailability(),
  });
}

function handleGetSecretaryDoctorsOverview() {
  const doctors = listDoctors();
  const availability = listDoctorAvailability();

  const availabilityByDoctorId = new Map(
    availability.map((item) => [item.doctorId, item])
  );

  return createSuccessResponse({
    doctors: doctors.map((doctor) => ({
      ...doctor,
      availability: availabilityByDoctorId.get(doctor.id) || null,
    })),
  });
}

function handleUpdateSecretaryDoctorAvailability(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return createErrorResponse(
      400,
      "invalid_payload",
      "Geçerli bir doktor çalışma programı güncelleme gövdesi gönderilmelidir."
    );
  }

  const doctorId = normalizeDoctorId(payload.doctorId);

  if (!doctorId) {
    return createErrorResponse(
      400,
      "missing_doctor_id",
      "doctorId zorunludur."
    );
  }

  const doctor = getDoctorById(doctorId);

  if (!doctor) {
    return createErrorResponse(
      404,
      "doctor_not_found",
      "Bu doctorId ile eşleşen mock doktor bulunamadı."
    );
  }

  const dayKey = resolveDayName(payload.day);

  if (!dayKey) {
    return createErrorResponse(
      400,
      "invalid_day",
      "Geçerli bir gün gönderilmelidir. Örnek: monday, Çarşamba, cumartesi."
    );
  }

  if (typeof payload.enabled !== "boolean") {
    return createErrorResponse(
      400,
      "invalid_enabled",
      "enabled alanı boolean olmalıdır."
    );
  }

  if (!Array.isArray(payload.windows)) {
    return createErrorResponse(
      400,
      "invalid_windows",
      "windows alanı dizi olmalıdır."
    );
  }

  const windows = payload.windows.map(sanitizeAvailabilityWindow);

  if (payload.enabled && windows.length === 0) {
    return createErrorResponse(
      400,
      "enabled_day_requires_windows",
      "enabled true ise en az bir geçerli saat aralığı gönderilmelidir."
    );
  }

  if (!payload.enabled && windows.length > 0) {
    return createErrorResponse(
      400,
      "disabled_day_cannot_have_windows",
      "enabled false ise windows boş olmalıdır."
    );
  }

  const invalidWindowIndex = windows.findIndex(
    (window) => !validateAvailabilityWindow(window)
  );

  if (invalidWindowIndex !== -1) {
    return createErrorResponse(
      400,
      "invalid_time_window",
      `windows[${invalidWindowIndex}] geçersiz. Saatler HH:mm formatında olmalı ve start end değerinden önce olmalıdır.`
    );
  }

  return createSuccessResponse({
    persistence: "not_persisted",
    message:
      "Mock doktor çalışma programı güncelleme isteği doğrulandı. Database olmadığı için bu sprintte kalıcı kayıt yapılmadı.",
    doctor: {
      id: doctor.id,
      name: doctor.name,
      title: doctor.title,
    },
    updatedAvailability: {
      doctorId,
      source: "mock",
      dayAvailability: {
        day: dayKey,
        dayLabel: DAY_LABELS[dayKey],
        enabled: payload.enabled,
        windows,
      },
    },
    safety: {
      createsAppointment: false,
      writesCalendar: false,
      checksCalendarConflict: false,
      exposesPatientData: false,
    },
  });
}

module.exports = {
  handleGetSecretaryDoctorAvailability,
  handleGetSecretaryDoctors,
  handleGetSecretaryDoctorsOverview,
  handleUpdateSecretaryDoctorAvailability,
};
