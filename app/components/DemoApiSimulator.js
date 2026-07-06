"use client";

import { useState } from "react";

const sampleMessage = "Merhaba, implant için randevu almak istiyorum.";
const googleWarning =
  "Google Calendar demo event creates a real event in the configured demo calendar.";

export default function DemoApiSimulator({ initialSimulator }) {
  const [message] = useState(initialSimulator?.patientMessage || sampleMessage);
  const [demoResult, setDemoResult] = useState(null);
  const [googleResult, setGoogleResult] = useState(null);
  const [isRunningDemo, setIsRunningDemo] = useState(false);
  const [isCreatingGoogleEvent, setIsCreatingGoogleEvent] = useState(false);
  const [demoError, setDemoError] = useState(null);
  const [googleError, setGoogleError] = useState(null);

  async function runEndToEndDemo() {
    setIsRunningDemo(true);
    setDemoError(null);
    setGoogleError(null);
    setGoogleResult(null);

    try {
      const classifyResult = await postJson("/api/demo/classify", { message });
      const availabilityResult = await postJson("/api/demo/availability", {
        message
      });
      const selectedSlotId =
        availabilityResult.available_slots?.[1]?.id ||
        availabilityResult.available_slots?.[0]?.id;
      const appointmentResult = await postJson("/api/demo/appointment", {
        message,
        selected_slot_id: selectedSlotId
      });

      setDemoResult(
        mapEndToEndResult({
          message,
          classifyResult,
          availabilityResult,
          appointmentResult
        })
      );
    } catch (requestError) {
      setDemoError(requestError.message);
    } finally {
      setIsRunningDemo(false);
    }
  }

  async function createGoogleCalendarDemoEvent() {
    setGoogleError(null);
    setGoogleResult(null);

    const confirmed = window.confirm(
      `${googleWarning}\n\nThis uses demo data only and will not use real patient data. Create the real demo calendar event now?`
    );

    if (!confirmed) {
      return;
    }

    setIsCreatingGoogleEvent(true);

    try {
      const result = await postJson("/api/demo/google-calendar-event", {
        message,
        confirm_real_calendar_event: true
      });

      setGoogleResult(result);
    } catch (requestError) {
      setGoogleError(requestError.message);
    } finally {
      setIsCreatingGoogleEvent(false);
    }
  }

  const availableSlots = demoResult?.availableSlots || [];
  const canCreateGoogleEvent = Boolean(demoResult?.mockAppointment);

  return (
    <section className="end-to-end-section" aria-labelledby="end-to-end-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">End-to-End Demo</p>
          <h2 id="end-to-end-title">Patient appointment flow</h2>
        </div>
        <span className="status-pill">Demo data only</span>
      </div>

      <div className="demo-runner-panel">
        <div>
          <span className="label">Sample patient message</span>
          <blockquote>{message}</blockquote>
        </div>
        <button type="button" onClick={runEndToEndDemo} disabled={isRunningDemo}>
          {isRunningDemo ? "Running End-to-End Demo..." : "Run End-to-End Demo"}
        </button>
      </div>

      {demoError ? <p className="error-message">{demoError}</p> : null}

      <div className="demo-step-grid" aria-label="End-to-end demo steps">
        <article className="demo-step-panel">
          <span className="step-label">Step 1</span>
          <h3>Patient message</h3>
          <p>{demoResult?.patientMessage || message}</p>
        </article>

        <article className="demo-step-panel">
          <span className="step-label">Step 2</span>
          <h3>Oravia understands intent</h3>
          {demoResult ? (
            <dl className="classification-list compact-list">
              <div>
                <dt>Detected intent</dt>
                <dd>{demoResult.intent}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatConfidence(demoResult.confidence)}</dd>
              </div>
              <div>
                <dt>Treatment interest</dt>
                <dd>{demoResult.treatmentInterest || "Not detected"}</dd>
              </div>
              <div>
                <dt>Requires handoff</dt>
                <dd>{formatBoolean(demoResult.requiresHandoff)}</dd>
              </div>
              <div className="wide-detail">
                <dt>AI reply</dt>
                <dd>{demoResult.reply}</dd>
              </div>
            </dl>
          ) : (
            <p className="pending-copy">Run the demo to classify the message.</p>
          )}
        </article>

        <article className="demo-step-panel">
          <span className="step-label">Step 3</span>
          <h3>Oravia suggests available slots</h3>
          {availableSlots.length > 0 ? (
            <ul className="slot-list">
              {availableSlots.map((slot) => (
                <li
                  className={
                    slot.id === demoResult?.selectedSlot?.id
                      ? "selected-slot"
                      : undefined
                  }
                  key={slot.id}
                >
                  <span>{slot.displayLabel}</span>
                  <small>{slot.timeRangeLabel}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pending-copy">Available demo slots will appear here.</p>
          )}
        </article>

        <article className="demo-step-panel">
          <span className="step-label">Step 4</span>
          <h3>Oravia creates a mock appointment</h3>
          {demoResult?.mockAppointment ? (
            <dl className="classification-list compact-list">
              <div>
                <dt>Selected slot</dt>
                <dd>{demoResult.selectedSlot.displayLabel}</dd>
              </div>
              <div>
                <dt>Mock appointment status</dt>
                <dd>{demoResult.mockAppointment.status}</dd>
              </div>
              <div>
                <dt>Calendar provider</dt>
                <dd>{demoResult.mockAppointment.calendarProvider}</dd>
              </div>
              <div className="wide-detail">
                <dt>Mock calendar_event_id</dt>
                <dd>{demoResult.mockAppointment.calendarEventId}</dd>
              </div>
            </dl>
          ) : (
            <p className="pending-copy">
              The mock appointment is created by the demo run.
            </p>
          )}
        </article>
      </div>

      <article className="google-demo-panel">
        <div className="panel-heading">
          <div>
            <span className="step-label">Step 5</span>
            <h3>Optional Google Calendar demo event</h3>
          </div>
          <span className="status-pill">Real demo calendar event</span>
        </div>
        <p className="warning-message">{googleWarning}</p>
        <p>
          This action is optional, never runs automatically, and creates an event
          titled <strong>ORAVIA DEMO - Implant Appointment</strong> using demo
          data only.
        </p>
        <button
          type="button"
          onClick={createGoogleCalendarDemoEvent}
          disabled={!canCreateGoogleEvent || isCreatingGoogleEvent}
        >
          {isCreatingGoogleEvent
            ? "Creating Google Calendar Demo Event..."
            : "Create Google Calendar Demo Event"}
        </button>
        {googleError ? <p className="error-message">{googleError}</p> : null}
        {googleResult ? (
          <dl className="classification-list compact-list">
            <div>
              <dt>Event title</dt>
              <dd>{googleResult.event_title}</dd>
            </div>
            <div>
              <dt>Calendar provider</dt>
              <dd>{googleResult.calendar_provider}</dd>
            </div>
            <div>
              <dt>Selected slot</dt>
              <dd>{googleResult.selected_slot.display_label}</dd>
            </div>
            <div className="wide-detail">
              <dt>Google calendar_event_id</dt>
              <dd>{googleResult.calendar_event_id}</dd>
            </div>
          </dl>
        ) : null}
      </article>
    </section>
  );
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Demo API request failed.");
  }

  return payload;
}

function mapEndToEndResult({
  message,
  classifyResult,
  availabilityResult,
  appointmentResult
}) {
  return {
    patientMessage: message,
    intent: classifyResult.result.intent,
    confidence: classifyResult.result.confidence,
    treatmentInterest: classifyResult.result.extracted_data.treatment_interest,
    requiresHandoff: classifyResult.result.requires_handoff,
    reply: availabilityResult.reply,
    availableSlots: availabilityResult.available_slots.map(mapSlot),
    selectedSlot: mapSlot(appointmentResult.selected_slot),
    mockAppointment: {
      status: appointmentResult.appointment.status,
      calendarProvider: appointmentResult.appointment.calendar_provider,
      calendarEventId: appointmentResult.appointment.calendar_event_id
    }
  };
}

function mapSlot(slot) {
  return {
    id: slot.id,
    displayLabel: slot.display_label,
    startAt: slot.start_at,
    endAt: slot.end_at,
    timeRangeLabel: `${formatIsoTime(slot.start_at)} to ${formatIsoTime(
      slot.end_at
    )}`
  };
}

function formatConfidence(value) {
  return `${Math.round(value * 100)}%`;
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
}

function formatIsoTime(value) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);

  return match ? match[1] : "";
}
