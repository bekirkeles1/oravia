"use client";

import { useEffect, useState } from "react";

export default function AppointmentReviewsWorkspace() {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({
    source: "mock",
    persistence: "not_persisted",
    safety: null
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAppointmentReviews() {
      try {
        const response = await fetch("/api/secretary/appointment-reviews");

        if (!response.ok) {
          throw new Error("Appointment review queue API yanıtı başarısız oldu.");
        }

        const payload = await response.json();

        if (!isMounted) {
          return;
        }

        setReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
        setSummary({
          source: payload.source || "mock",
          persistence: payload.persistence || "not_persisted",
          safety: payload.safety || null
        });
        setLoading(false);
        setLoadError("");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setReviews([]);
        setLoading(false);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Appointment review queue verisi yüklenemedi."
        );
      }
    }

    loadAppointmentReviews();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section
      className="appointment-reviews-workspace-section"
      aria-labelledby="appointment-reviews-workspace-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Secretary workspace</p>
          <h2 id="appointment-reviews-workspace-title">
            Pending Appointment Reviews
          </h2>
          <p>
            AI mesajlaşmadan gelen slot seçimlerini mock ve read-only sırada
            gösterir; gerçek randevu oluşturmaz.
          </p>
        </div>
        <span className="status-pill">Mock read-only</span>
      </div>

      <article className="appointment-reviews-workspace-card">
        <div className="appointment-reviews-summary-grid">
          <div>
            <span>Kaynak</span>
            <strong>{summary.source}</strong>
          </div>
          <div>
            <span>Kayıt</span>
            <strong>{summary.persistence}</strong>
          </div>
          <div>
            <span>Bekleyen inceleme</span>
            <strong>{reviews.length}</strong>
          </div>
        </div>

        <div className="appointment-reviews-safety-note">
          <strong>Read-only mock queue</strong>
          <span>
            No booking created. Calendar not checked. Secretary confirmation is
            required before any real booking workflow.
          </span>
        </div>

        {loading ? (
          <p className="appointment-reviews-state">
            Appointment review queue yükleniyor...
          </p>
        ) : null}

        {loadError ? <p className="manual-form-error">{loadError}</p> : null}

        {!loading && !loadError && reviews.length === 0 ? (
          <div className="appointment-reviews-empty-state">
            <strong>No pending appointment reviews</strong>
            <span>
              Mock route boş döndü. Bu panel kalıcı kayıt tutmaz, randevu
              oluşturmaz ve takvim çakışması kontrolü yapmaz.
            </span>
          </div>
        ) : null}

        {!loading && !loadError && reviews.length > 0 ? (
          <div className="appointment-reviews-list">
            {reviews.map((review) => (
              <article className="appointment-review-item" key={review.id}>
                <div>
                  <span>{review.status}</span>
                  <strong>
                    {review.selectedSlot?.doctorName || "Mock doctor"} ·{" "}
                    {review.selectedSlot?.time || "Saat bekleniyor"}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Tedavi</dt>
                    <dd>{review.treatment || "Belirtilmedi"}</dd>
                  </div>
                  <div>
                    <dt>Gün</dt>
                    <dd>{review.selectedSlot?.dayLabel || review.day}</dd>
                  </div>
                  <div>
                    <dt>Booking created</dt>
                    <dd>{String(review.bookingCreated === true)}</dd>
                  </div>
                  <div>
                    <dt>Calendar checked</dt>
                    <dd>{String(review.calendarChecked === true)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : null}
      </article>
    </section>
  );
}
