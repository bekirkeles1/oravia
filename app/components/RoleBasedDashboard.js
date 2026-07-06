"use client";

import { useState } from "react";

export default function RoleBasedDashboard({ rolePrototype }) {
  const [selectedRole, setSelectedRole] = useState(
    rolePrototype.defaultRole || "secretary"
  );

  return (
    <section className="role-dashboard-section" aria-labelledby="role-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Klinik operasyon kokpiti</p>
          <h2 id="role-title">Rol bazlı iç operasyon ekranı</h2>
        </div>
        <span className="status-pill">Demo veri</span>
      </div>

      <div className="role-switcher-panel">
        <div>
          <span className="label">Görünüm</span>
          <div className="role-switcher" role="tablist" aria-label="Görünüm">
            {rolePrototype.roles.map((role) => (
              <button
                aria-selected={selectedRole === role.id}
                className={
                  selectedRole === role.id ? "role-tab active" : "role-tab"
                }
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                role="tab"
                type="button"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
        <p>{rolePrototype.note}</p>
      </div>

      <div className="operations-summary-grid" aria-label="Operasyon özeti">
        {rolePrototype.topSummary.map((item) => (
          <article className="operations-summary-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>

      {selectedRole === "doctor" ? (
        <DoctorView data={rolePrototype.doctor} />
      ) : null}
      {selectedRole === "secretary" ? (
        <SecretaryView data={rolePrototype.secretary} />
      ) : null}
      {selectedRole === "admin" ? <AdminView data={rolePrototype.admin} /> : null}
    </section>
  );
}

function DoctorView({ data }) {
  return (
    <div className="role-view" aria-label="Doktor Ekranı">
      <RoleIntro title={data.title} subtitle={data.subtitle} />

      <div className="role-grid two-column">
        <article className="role-card">
          <h3>Bugünkü randevular</h3>
          <div className="role-list">
            {data.todayAppointments.map((appointment) => (
              <div className="role-list-item" key={appointment.time}>
                <strong>{appointment.time}</strong>
                <span>{appointment.patientName}</span>
                <dl className="role-detail-list">
                  <div>
                    <dt>Tedavi ilgisi</dt>
                    <dd>{appointment.treatmentInterest}</dd>
                  </div>
                  <div>
                    <dt>Randevu durumu</dt>
                    <dd>{appointment.appointmentStatus}</dd>
                  </div>
                  <div className="wide-detail">
                    <dt>Hasta notları</dt>
                    <dd>{appointment.patientNotes}</dd>
                  </div>
                  <div className="wide-detail">
                    <dt>AI görüşme özeti</dt>
                    <dd>{appointment.aiConversationSummary}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </article>

        <article className="role-card">
          <h3>Haftalık randevu özeti</h3>
          <div className="role-list">
            {data.weeklyOverview.map((day) => (
              <div className="role-row" key={day.day}>
                <span>{day.day}</span>
                <strong>{day.appointments}</strong>
                <small>{day.focus}</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function SecretaryView({ data }) {
  const timeline = [
    {
      time: "09:30",
      patient: "Demo Patient",
      doctor: "Dr. Demo Dentist",
      treatment: "İmplant görüşmesi",
      source: "AI Agent",
      status: "Onaylandı"
    },
    {
      time: "11:00",
      patient: "Demo Patient",
      doctor: "Dr. Demo Dentist",
      treatment: "Kontrol randevusu",
      source: "Telefon",
      status: "Sekreter girdi"
    },
    {
      time: "14:00",
      patient: "Demo Patient",
      doctor: "Dr. Demo Dentist",
      treatment: "İmplant muayenesi",
      source: "AI Agent",
      status: "Takvime işlendi"
    }
  ];

  return (
    <div className="role-view secretary-view" aria-label="Sekreter Operasyon Ekranı">
      <RoleIntro title={data.title} subtitle={data.subtitle} />

      <div className="secretary-cockpit-grid">
        <article className="role-card secretary-timeline-card">
          <div className="panel-heading compact-heading">
            <div>
              <h3>Bugünün randevu akışı</h3>
              <p>Sekreterin mesai başında takip edeceği günlük klinik sırası.</p>
            </div>
            <span className="status-pill">Demo gün</span>
          </div>

          <div className="appointment-timeline">
            {timeline.map((item) => (
              <div className="timeline-item" key={`${item.time}-${item.treatment}`}>
                <div className="timeline-time">{item.time}</div>
                <div className="timeline-content">
                  <div className="timeline-main-row">
                    <strong>{item.patient}</strong>
                    <span>{item.status}</span>
                  </div>
                  <p>{item.treatment}</p>
                  <small>
                    {item.doctor} · Kaynak: {item.source}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="secretary-side-stack">
          <article className="role-card">
            <h3>Bekleyen AI handoff</h3>
            <div className="role-list">
              {data.handoffQueue.map((handoff) => (
                <div className="role-list-item" key={handoff.reason}>
                  <strong>{handoff.patientName}</strong>
                  <span>{handoff.reason}</span>
                  <small>{handoff.status}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="role-card manual-entry-preview">
            <h3>Telefonla gelen randevu</h3>
            <p>
              Sekreter telefonla gelen hastayı buradan doktora ve saate bağlayacak.
            </p>
            <div className="manual-entry-fields">
              <span>Hasta adı</span>
              <span>Telefon</span>
              <span>Doktor</span>
              <span>Tarih / saat</span>
            </div>
            <span className="status-pill">Manuel randevu masası yakında</span>
          </article>
        </aside>

        <article className="role-card">
          <h3>Doktor müsaitliği</h3>
          <div className="role-list">
            {data.doctorAvailability.map((doctor) => (
              <div className="role-row" key={doctor.nextSlot}>
                <span>{doctor.doctorName}</span>
                <strong>{doctor.nextSlot}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="role-card">
          <h3>Google Calendar senkronu</h3>
          <dl className="role-detail-list">
            <div>
              <dt>Takvim sağlayıcı</dt>
              <dd>{data.googleCalendarSyncStatus.provider}</dd>
            </div>
            <div>
              <dt>Senkron durumu</dt>
              <dd>{data.googleCalendarSyncStatus.status}</dd>
            </div>
            <div className="wide-detail">
              <dt>Son event id</dt>
              <dd>{data.googleCalendarSyncStatus.lastEventId}</dd>
            </div>
          </dl>
        </article>
      </div>
    </div>
  );
}
function AdminView({ data }) {
  return (
    <div className="role-view" aria-label="Yönetici Performans Ekranı">
      <RoleIntro title={data.title} subtitle={data.subtitle} />

      <div className="role-grid two-column">
        <article className="role-card">
          <h3>Klinik performans özeti</h3>
          <MetricGrid metrics={data.metrics} />
        </article>

        <article className="role-card">
          <h3>Dönüşüm göstergeleri</h3>
          <ul className="role-bullet-list">
            {data.conversionIndicators.map((indicator) => (
              <li key={indicator}>{indicator}</li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}

function RoleIntro({ title, subtitle }) {
  return (
    <div className="role-intro">
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function MetricGrid({ metrics }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div className="metric-tile" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}
