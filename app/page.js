import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDemoDashboardData } from "../src/dashboard/demoDashboardData";
import authCookies from "../src/auth/authCookies";
import authRepositoryFactory from "../src/auth/authRepositoryFactory";
import authService from "../src/auth/authService";
import routeAuth from "../src/auth/routeAuth";
import AppointmentReviewsWorkspace from "./components/AppointmentReviewsWorkspace";
import DemoApiSimulator from "./components/DemoApiSimulator";
import DoctorAvailabilityWorkspace from "./components/DoctorAvailabilityWorkspace";
import RoleBasedDashboard from "./components/RoleBasedDashboard";
import SessionStatus from "./components/SessionStatus";
import OperationsStatusPanel from "./components/OperationsStatusPanel";
import ReminderOperationsPanel from "./components/ReminderOperationsPanel";
import EmptySlotOperationsPanel from "./components/EmptySlotOperationsPanel";
import WhatsAppIntegrationStatusPanel from "./components/WhatsAppIntegrationStatusPanel";

export default async function DashboardPage() {
  const session = await resolveDashboardSession();
  const dashboard = getDemoDashboardData();
  const appointment = dashboard.appointments[0];
  const rolePrototype = dashboard.rolePrototype;
  const simulator = dashboard.simulator;

  return (
    <main className="clinic-app-shell">
      <aside className="clinic-sidebar" aria-label="Oravia navigation">
        <div className="sidebar-brand">
          <div className="brand-mark">O</div>
          <div>
            <strong>Oravia</strong>
            <span>Dental AI Agent</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <a className="sidebar-nav-item active" href="#operations">
            Operasyon
          </a>
          <a className="sidebar-nav-item" href="#appointments">
            Randevular
          </a>
          <a className="sidebar-nav-item" href="#calendar">
            Takvim
          </a>
          <a className="sidebar-nav-item" href="#doctor-availability">
            Doktor Müsaitlik
          </a>
          <a className="sidebar-nav-item" href="#appointment-reviews">
            Appointment Reviews
          </a>
          <a className="sidebar-nav-item" href="#handoff">
            AI Handoff
          </a>
          <a className="sidebar-nav-item" href="#settings">
            Ayarlar
          </a>
        </nav>

        <div className="sidebar-footer-card">
          <span>Demo ortamı</span>
          <strong>Gerçek hasta verisi yok</strong>
          <small>WhatsApp ve database henüz bağlı değil.</small>
        </div>
      </aside>

      <section className="clinic-main">
        <header className="clinic-topbar">
          <div>
            <span className="topbar-label">Klinik</span>
            <strong>{dashboard.clinic.name}</strong>
          </div>

          <div className="topbar-meta">
            <span>Salı, 7 Temmuz 2026</span>
            <span className="status-pill">Demo veri</span>
            <SessionStatus user={session?.user || null} />
          </div>
        </header>

        <section className="clinic-hero" aria-labelledby="dashboard-title">
          <div>
            <p className="eyebrow">Internal clinic operations</p>
            <h1 id="dashboard-title">Klinik Operasyon Kokpiti</h1>
            <p>
              Oravia hasta tarafında AI sekreter olarak çalışır; klinik ekibi
              bu panelden günlük randevu akışını, handoffları ve takvim
              durumunu takip eder.
            </p>
          </div>

          <div className="hero-status-card">
            <span>Takvim sağlayıcı</span>
            <strong>{appointment.calendarProviderLabel}</strong>
            <small>{appointment.calendarProvider}</small>
          </div>
        </section>

        <section className="clinic-context-grid" aria-label="Clinic context">
          <div className="context-card">
            <span>Klinik</span>
            <strong>{dashboard.clinic.name}</strong>
            <small>{dashboard.clinic.timezone}</small>
          </div>

          <div className="context-card">
            <span>Aktif doktor</span>
            <strong>{dashboard.doctor.name}</strong>
            <small>{dashboard.doctor.specialty}</small>
          </div>

          <div className="context-card">
            <span>Bugünkü demo randevu</span>
            <strong>{appointment.startDisplayLabel}</strong>
            <small>{appointment.treatmentInterest}</small>
          </div>
        </section>

        <section id="operations">
          <RoleBasedDashboard rolePrototype={rolePrototype} />
        </section>

        <section id="doctor-availability">
          <DoctorAvailabilityWorkspace />
        </section>

        <section id="appointment-reviews">
          <AppointmentReviewsWorkspace />
        </section>

        <section className="technical-section" aria-labelledby="system-status-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Technical demo</p>
              <h2 id="system-status-title">Sistem Durumu</h2>
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

        <OperationsStatusPanel />

        <ReminderOperationsPanel />

        <EmptySlotOperationsPanel />

        <WhatsAppIntegrationStatusPanel />

        <section className="technical-section">
          <DemoApiSimulator initialSimulator={simulator} />
        </section>
      </section>
    </main>
  );
}

async function resolveDashboardSession() {
  if (!routeAuth.isAuthEnforced()) {
    return null;
  }

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(authCookies.SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    redirect("/login");
  }

  let runtime;

  try {
    runtime = authRepositoryFactory.createAuthRuntime({});
    const result = authService.resolveCurrentSession({
      repository: runtime.repository,
      token: rawToken,
    });

    if (!result.accepted) {
      redirect("/login");
    }

    return {
      user: result.actor,
      session: result.session,
    };
  } finally {
    runtime?.close();
  }
}
