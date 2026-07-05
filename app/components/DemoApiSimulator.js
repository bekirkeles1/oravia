"use client";

import { useState } from "react";

const sampleMessage = "Merhaba, implant için randevu almak istiyorum.";

export default function DemoApiSimulator({ initialSimulator }) {
  const [message, setMessage] = useState(
    initialSimulator?.patientMessage || sampleMessage
  );
  const [simulation, setSimulation] = useState(initialSimulator || null);
  const [mockAppointment, setMockAppointment] = useState(null);
  const [isRunningSimulation, setIsRunningSimulation] = useState(false);
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [error, setError] = useState(null);

  async function runSimulation() {
    setIsRunningSimulation(true);
    setError(null);
    setMockAppointment(null);

    try {
      const [classifyResult, availabilityResult] = await Promise.all([
        postJson("/api/demo/classify", { message }),
        postJson("/api/demo/availability", { message })
      ]);

      setSimulation(mapSimulationResult({
        message,
        classifyResult,
        availabilityResult
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsRunningSimulation(false);
    }
  }

  async function createMockAppointment() {
    setIsCreatingAppointment(true);
    setError(null);

    try {
      const appointmentResult = await postJson("/api/demo/appointment", {
        message
      });

      setMockAppointment(appointmentResult);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCreatingAppointment(false);
    }
  }

  const availableSlots = simulation?.availableSlots || [];
  const canCreateAppointment =
    availableSlots.length > 0 && !isRunningSimulation && !isCreatingAppointment;

  return (
    <section className="simulator-section" aria-labelledby="simulator-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Conversation simulator</p>
          <h2 id="simulator-title">Patient message understanding</h2>
        </div>
        <span className="status-pill">
          Demo API mode — no real patient data, no real calendar event
        </span>
      </div>

      <div className="simulator-controls">
        <label htmlFor="demo-message">Sample patient message</label>
        <textarea
          id="demo-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
        />
        <div className="simulator-actions">
          <button
            type="button"
            onClick={runSimulation}
            disabled={isRunningSimulation || isCreatingAppointment}
          >
            {isRunningSimulation ? "Running..." : "Run demo simulation"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={createMockAppointment}
            disabled={!canCreateAppointment}
          >
            {isCreatingAppointment ? "Creating..." : "Create mock appointment"}
          </button>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
      </div>

      {simulation ? (
        <>
          <div className="simulator-grid">
            <article className="message-panel">
              <span className="label">Current patient message</span>
              <blockquote>{simulation.patientMessage}</blockquote>
            </article>

            <article className="classification-panel">
              <div className="panel-heading">
                <h3>Classification result</h3>
                <span className="provider-badge">
                  {simulation.calendarProviderLabel}
                </span>
              </div>
              <dl className="classification-list">
                <div>
                  <dt>Detected intent</dt>
                  <dd>{simulation.intent}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{formatConfidence(simulation.confidence)}</dd>
                </div>
                <div>
                  <dt>Treatment interest</dt>
                  <dd>{simulation.treatmentInterest || "Not detected"}</dd>
                </div>
                <div>
                  <dt>Requires handoff</dt>
                  <dd>{formatBoolean(simulation.requiresHandoff)}</dd>
                </div>
                <div className="wide-detail">
                  <dt>Patient message summary</dt>
                  <dd>{simulation.patientMessageSummary}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="simulator-output-grid">
            <article className="slots-panel">
              <div className="panel-heading">
                <h3>Suggested available slots</h3>
                <span className="count-badge">{availableSlots.length}</span>
              </div>
              <ul className="slot-list">
                {availableSlots.map((slot) => (
                  <li key={slot.id}>
                    <span>{slot.displayLabel}</span>
                    <small>{slot.timeRangeLabel}</small>
                  </li>
                ))}
              </ul>
            </article>

            <article className="reply-panel">
              <span className="label">AI reply</span>
              <p>{simulation.reply}</p>
            </article>
          </div>
        </>
      ) : null}

      {mockAppointment ? (
        <article className="mock-appointment-panel">
          <div className="panel-heading">
            <h3>Mock appointment created</h3>
            <span className="confirmed-badge">
              {mockAppointment.appointment.status}
            </span>
          </div>
          <dl className="classification-list">
            <div>
              <dt>Selected slot</dt>
              <dd>{mockAppointment.selected_slot.display_label}</dd>
            </div>
            <div>
              <dt>Calendar provider</dt>
              <dd>{mockAppointment.appointment.calendar_provider}</dd>
            </div>
            <div className="wide-detail">
              <dt>Calendar event</dt>
              <dd>{mockAppointment.appointment.calendar_event_id}</dd>
            </div>
          </dl>
        </article>
      ) : null}
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

function mapSimulationResult({ message, classifyResult, availabilityResult }) {
  return {
    label: "Demo API mode — no real patient data, no real calendar event",
    patientMessage: message,
    intent: classifyResult.result.intent,
    confidence: classifyResult.result.confidence,
    treatmentInterest: classifyResult.result.extracted_data.treatment_interest,
    requiresHandoff: classifyResult.result.requires_handoff,
    patientMessageSummary: classifyResult.result.patient_message_summary,
    availableSlots: availabilityResult.available_slots.map((slot) => ({
      id: slot.id,
      displayLabel: slot.display_label,
      startAt: slot.start_at,
      endAt: slot.end_at,
      timeRangeLabel: `${formatIsoTime(slot.start_at)} to ${formatIsoTime(
        slot.end_at
      )}`
    })),
    reply: availabilityResult.reply,
    calendarProvider: availabilityResult.calendar_provider,
    calendarProviderLabel: getCalendarProviderLabel(
      availabilityResult.calendar_provider
    )
  };
}

function getCalendarProviderLabel(calendarProvider) {
  if (calendarProvider === "mock") {
    return "Mock calendar";
  }

  return calendarProvider;
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
