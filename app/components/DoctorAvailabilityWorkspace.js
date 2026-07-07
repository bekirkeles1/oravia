"use client";

import { useEffect, useState } from "react";

const WEEKDAY_LABELS = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar"
};

const WEEKDAY_OPTIONS = Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
  value,
  label
}));

function buildAvailabilityRows(availability) {
  const availabilityByDay = new Map(
    Array.isArray(availability?.weeklyAvailability)
      ? availability.weeklyAvailability.map((dayAvailability) => [
          dayAvailability.day,
          dayAvailability
        ])
      : []
  );

  return WEEKDAY_OPTIONS.map((day) => {
    const dayAvailability = availabilityByDay.get(day.value);
    const windows = Array.isArray(dayAvailability?.windows)
      ? dayAvailability.windows
      : [];
    const firstWindow = windows[0] || {};
    const secondWindow = windows[1] || {};

    return {
      day: day.value,
      enabled: Boolean(dayAvailability?.enabled && windows.length > 0),
      start: firstWindow.start || "09:00",
      end: firstWindow.end || "17:00",
      secondStart: secondWindow.start || "",
      secondEnd: secondWindow.end || ""
    };
  });
}

function getRowState(rowStates, day) {
  return (
    rowStates[day] || {
      submitting: false,
      error: "",
      success: ""
    }
  );
}

function timeToMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""))) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getTimelineStyle(start, end) {
  const dayStart = 8 * 60;
  const dayEnd = 20 * 60;
  const total = dayEnd - dayStart;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (
    startMinutes === null ||
    endMinutes === null ||
    startMinutes >= endMinutes
  ) {
    return {
      left: "0%",
      width: "0%"
    };
  }

  const clampedStart = Math.max(startMinutes, dayStart);
  const clampedEnd = Math.min(endMinutes, dayEnd);

  if (clampedStart >= clampedEnd) {
    return {
      left: "0%",
      width: "0%"
    };
  }

  return {
    left: `${((clampedStart - dayStart) / total) * 100}%`,
    width: `${((clampedEnd - clampedStart) / total) * 100}%`
  };
}

async function patchJson(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        payload.error ||
        "Doktor müsaitlik doğrulama isteği başarısız oldu."
    );
  }

  return payload;
}

export default function DoctorAvailabilityWorkspace() {
  const [doctors, setDoctors] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [rows, setRows] = useState(() => buildAvailabilityRows(null));
  const [rowStates, setRowStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceData() {
      try {
        const [doctorsResponse, availabilityResponse] = await Promise.all([
          fetch("/api/secretary/doctors"),
          fetch("/api/secretary/doctors/availability")
        ]);

        if (!doctorsResponse.ok || !availabilityResponse.ok) {
          throw new Error("Doktor müsaitlik API yanıtı başarısız oldu.");
        }

        const [doctorsPayload, availabilityPayload] = await Promise.all([
          doctorsResponse.json(),
          availabilityResponse.json()
        ]);

        if (!isMounted) {
          return;
        }

        const nextDoctors = Array.isArray(doctorsPayload.doctors)
          ? doctorsPayload.doctors
          : [];
        const nextAvailability = Array.isArray(availabilityPayload.availability)
          ? availabilityPayload.availability
          : [];

        setDoctors(nextDoctors);
        setAvailability(nextAvailability);
        setSelectedDoctorId((current) => current || nextDoctors[0]?.id || "");
        setLoading(false);
        setLoadError("");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDoctors([]);
        setAvailability([]);
        setLoading(false);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Doktor müsaitlik verisi yüklenemedi."
        );
      }
    }

    loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const selectedAvailability = availability.find(
      (item) => item.doctorId === selectedDoctorId
    );

    setRows(buildAvailabilityRows(selectedAvailability));
    setRowStates({});
  }, [availability, selectedDoctorId]);

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);

  function updateRow(day, field, value) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.day === day
          ? {
              ...row,
              [field]: value
            }
          : row
      )
    );

    setRowStates((current) => ({
      ...current,
      [day]: {
        submitting: false,
        error: "",
        success: ""
      }
    }));
  }

  function setRowState(day, nextState) {
    setRowStates((current) => ({
      ...current,
      [day]: {
        ...getRowState(current, day),
        ...nextState
      }
    }));
  }

  async function handleRowSubmit(event, day) {
    event.preventDefault();

    const row = rows.find((item) => item.day === day);

    if (!row || !selectedDoctorId) {
      setRowState(day, {
        submitting: false,
        error: "Doktor ve gün seçimi zorunludur.",
        success: ""
      });
      return;
    }

    const primaryWindow = {
      start: row.start.trim(),
      end: row.end.trim()
    };

    const secondaryWindow = {
      start: row.secondStart.trim(),
      end: row.secondEnd.trim()
    };

    const hasSecondaryWindow =
      Boolean(secondaryWindow.start) || Boolean(secondaryWindow.end);

    if (row.enabled && (!primaryWindow.start || !primaryWindow.end)) {
      setRowState(day, {
        submitting: false,
        error: "Aktif gün için başlangıç ve bitiş saati girilmelidir.",
        success: ""
      });
      return;
    }

    if (hasSecondaryWindow && (!secondaryWindow.start || !secondaryWindow.end)) {
      setRowState(day, {
        submitting: false,
        error:
          "İkinci saat aralığı kullanılacaksa başlangıç ve bitiş birlikte girilmelidir.",
        success: ""
      });
      return;
    }

    const windows = row.enabled
      ? [primaryWindow, ...(hasSecondaryWindow ? [secondaryWindow] : [])]
      : [];

    setRowState(day, {
      submitting: true,
      error: "",
      success: ""
    });

    try {
      const result = await patchJson("/api/secretary/doctors/availability", {
        doctorId: selectedDoctorId,
        day: row.day,
        enabled: row.enabled,
        windows
      });

      setRowState(day, {
        submitting: false,
        error: "",
        success: `${result.doctor.name} · ${result.updatedAvailability.dayAvailability.dayLabel} doğrulandı. Kalıcı kayıt yapılmadı (${result.persistence}).`
      });
    } catch (error) {
      setRowState(day, {
        submitting: false,
        error:
          error instanceof Error
            ? error.message
            : "Mock müsaitlik doğrulama isteği başarısız oldu.",
        success: ""
      });
    }
  }

  return (
    <section
      className="doctor-availability-workspace-section"
      aria-labelledby="doctor-availability-workspace-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Secretary workspace</p>
          <h2 id="doctor-availability-workspace-title">Doktor Müsaitlik</h2>
          <p>
            Doktor çalışma günlerini ve saat aralıklarını mock API üzerinden
            doğrulamak için ayrı çalışma alanı.
          </p>
        </div>
        <span className="status-pill">Mock doğrulama</span>
      </div>

      <article className="doctor-availability-workspace-card">
        <div className="doctor-availability-workspace-toolbar">
          <label>
            Doktor seçimi
            <select
              disabled={loading || doctors.length === 0}
              value={selectedDoctorId}
              onChange={(event) => setSelectedDoctorId(event.target.value)}
            >
              {doctors.length === 0 ? (
                <option value="">Mock doktor yok</option>
              ) : null}
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </label>

          <div className="doctor-availability-workspace-summary">
            <strong>{selectedDoctor?.name || "Doktor seçilmedi"}</strong>
            <span>{selectedDoctor?.title || "Mock doktor programı"}</span>
            <small>
              Bu ekran randevu oluşturmaz, takvime yazmaz ve database’e kalıcı
              kayıt yapmaz.
            </small>
          </div>
        </div>

        {loading ? (
          <p className="doctor-availability-workspace-state">
            Doktor müsaitlik verisi yükleniyor...
          </p>
        ) : null}

        {loadError ? (
          <p className="manual-form-error">{loadError}</p>
        ) : null}

        {!loading && !loadError ? (
          <div className="doctor-availability-day-list">
            {rows.map((row) => {
              const rowState = getRowState(rowStates, row.day);

              return (
                <form
                  className={
                    row.enabled
                      ? "doctor-availability-day-row"
                      : "doctor-availability-day-row closed"
                  }
                  key={row.day}
                  onSubmit={(event) => handleRowSubmit(event, row.day)}
                >
                  <div className="doctor-availability-day-title">
                    <strong>{WEEKDAY_LABELS[row.day]}</strong>
                    <label>
                      <input
                        checked={!row.enabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateRow(row.day, "enabled", !event.target.checked)
                        }
                      />
                      Kapalı
                    </label>
                  </div>

                  <div className="doctor-availability-time-grid">
                    <label>
                      Başlangıç 1
                      <input
                        disabled={!row.enabled}
                        type="time"
                        value={row.start}
                        onChange={(event) =>
                          updateRow(row.day, "start", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Bitiş 1
                      <input
                        disabled={!row.enabled}
                        type="time"
                        value={row.end}
                        onChange={(event) =>
                          updateRow(row.day, "end", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Başlangıç 2
                      <input
                        disabled={!row.enabled}
                        type="time"
                        value={row.secondStart}
                        onChange={(event) =>
                          updateRow(row.day, "secondStart", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Bitiş 2
                      <input
                        disabled={!row.enabled}
                        type="time"
                        value={row.secondEnd}
                        onChange={(event) =>
                          updateRow(row.day, "secondEnd", event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className="doctor-availability-timeline">
                    <span>08:00</span>
                    <div className="doctor-availability-timeline-track">
                      {row.enabled ? (
                        <>
                          <i
                            className="doctor-availability-timeline-block"
                            style={getTimelineStyle(row.start, row.end)}
                          />
                          {row.secondStart && row.secondEnd ? (
                            <i
                              className="doctor-availability-timeline-block secondary"
                              style={getTimelineStyle(
                                row.secondStart,
                                row.secondEnd
                              )}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <span>20:00</span>
                  </div>

                  <button
                    className="doctor-availability-day-button"
                    disabled={rowState.submitting || loading || doctors.length === 0}
                    type="submit"
                  >
                    {rowState.submitting ? "Doğrulanıyor..." : "Mock doğrula"}
                  </button>

                  {rowState.error ? (
                    <p className="manual-form-error doctor-availability-row-message">
                      {rowState.error}
                    </p>
                  ) : null}

                  {rowState.success ? (
                    <p className="manual-form-success doctor-availability-row-message">
                      {rowState.success}
                    </p>
                  ) : null}
                </form>
              );
            })}
          </div>
        ) : null}
      </article>
    </section>
  );
}
