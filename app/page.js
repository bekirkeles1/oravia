import { getDemoDashboardData } from "../src/dashboard/demoDashboardData";
import DemoApiSimulator from "./components/DemoApiSimulator";

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

      <section className="status-section" aria-labelledby="system-status-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">System</p>
            <h2 id="system-status-title">System Status</h2>
          </div>
        </div>

        <div className="system-status-grid">
          {dashboard.systemStatus.map((item) => (
            <article className="system-status-item" key={item.name}>
              <span>{item.name}</span>
              <strong className={`system-status-badge ${item.tone}`}>
                {item.status}
              </strong>
            </article>
          ))}
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
                  <dd>{item.startDisplayLabel}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{item.endDisplayLabel}</dd>
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

      <DemoApiSimulator initialSimulator={simulator} />
    </main>
  );
}

function formatTreatment(value) {
  return value ? `${value} appointment` : "General appointment";
}
