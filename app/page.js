import { getDemoDashboardData } from "../src/dashboard/demoDashboardData";

export default function DashboardPage() {
  const dashboard = getDemoDashboardData();
  const appointment = dashboard.appointments[0];
  const simulator = dashboard.simulator;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-header" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Local demo dashboard</p>
          <h1 id="dashboard-title">{dashboard.productName}</h1>
        </div>
        <div className="status-pill">Demo data only</div>
      </section>

      <section className="summary-grid" aria-label="Clinic summary">
        <div className="summary-panel">
          <span className="label">Clinic</span>
          <strong>{dashboard.clinic.name}</strong>
          <span>{dashboard.clinic.timezone}</span>
        </div>
        <div className="summary-panel">
          <span className="label">Doctor</span>
          <strong>{dashboard.doctor.name}</strong>
          <span>{dashboard.doctor.specialty}</span>
        </div>
        <div className="summary-panel">
          <span className="label">Calendar provider</span>
          <strong>{appointment.calendarProviderLabel}</strong>
          <span>{appointment.calendarProvider}</span>
        </div>
      </section>

      <section className="appointments-section" aria-labelledby="appointments-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Appointments</p>
            <h2 id="appointments-title">Upcoming appointments</h2>
          </div>
          <span className="count-badge">{dashboard.appointments.length}</span>
        </div>

        <div className="appointment-list">
          {dashboard.appointments.map((item) => (
            <article className="appointment-card" key={item.id}>
              <div className="appointment-main">
                <div>
                  <h3>{item.patientName}</h3>
                  <p>{formatTreatment(item.treatmentInterest)}</p>
                </div>
                <span className="confirmed-badge">{item.status}</span>
              </div>

              <dl className="appointment-details">
                <div>
                  <dt>Start</dt>
                  <dd>{formatDateTime(item.startTime)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{formatDateTime(item.endTime)}</dd>
                </div>
                <div>
                  <dt>Created by</dt>
                  <dd>{item.createdBy}</dd>
                </div>
                <div>
                  <dt>Calendar event</dt>
                  <dd>{item.calendarEventId}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="simulator-section" aria-labelledby="simulator-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conversation simulator</p>
            <h2 id="simulator-title">Patient message understanding</h2>
          </div>
          <span className="status-pill">{simulator.label}</span>
        </div>

        <div className="simulator-grid">
          <article className="message-panel">
            <span className="label">Sample patient message</span>
            <blockquote>{simulator.patientMessage}</blockquote>
          </article>

          <article className="classification-panel">
            <div className="panel-heading">
              <h3>Classification result</h3>
              <span className="provider-badge">
                {simulator.calendarProviderLabel}
              </span>
            </div>
            <dl className="classification-list">
              <div>
                <dt>Detected intent</dt>
                <dd>{simulator.intent}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatConfidence(simulator.confidence)}</dd>
              </div>
              <div>
                <dt>Treatment interest</dt>
                <dd>{simulator.treatmentInterest}</dd>
              </div>
              <div>
                <dt>Requires handoff</dt>
                <dd>{formatBoolean(simulator.requiresHandoff)}</dd>
              </div>
              <div className="wide-detail">
                <dt>Patient message summary</dt>
                <dd>{simulator.patientMessageSummary}</dd>
              </div>
            </dl>
          </article>
        </div>

        <div className="simulator-output-grid">
          <article className="slots-panel">
            <div className="panel-heading">
              <h3>Suggested available slots</h3>
              <span className="count-badge">{simulator.availableSlots.length}</span>
            </div>
            <ul className="slot-list">
              {simulator.availableSlots.map((slot) => (
                <li key={slot.id}>
                  <span>{slot.displayLabel}</span>
                  <small>
                    {formatDateTime(slot.startAt)} to {formatTime(slot.endAt)}
                  </small>
                </li>
              ))}
            </ul>
          </article>

          <article className="reply-panel">
            <span className="label">AI reply</span>
            <p>{simulator.reply}</p>
          </article>
        </div>
      </section>
    </main>
  );
}

function formatTreatment(value) {
  return value ? `${value} appointment` : "General appointment";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

function formatConfidence(value) {
  return `${Math.round(value * 100)}%`;
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
}
