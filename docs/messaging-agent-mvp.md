# Oravia Messaging Agent MVP Notes

## Product direction

Oravia patients should not book appointments from the dashboard.

The patient-facing flow is WhatsApp / messaging first. Patients will talk to the AI Agent through a messaging channel.

The dashboard is internal-only and is for clinic operations:
- Doctor
- Secretary
- Manager / Admin

## Current messaging status

The current messaging-agent foundation is intentionally small.

Implemented:
- Pure inbound handler: src/api/messagingInboundHandler.js
- Next.js API bridge: POST /api/messaging/inbound
- Route file: app/api/messaging/inbound/route.js
- Demo script: npm run demo:messaging-inbound
- Local intent classifier reuse
- Payload validation
- Unknown intent handoff response

Current valid sample payload:

{
  "channel": "whatsapp",
  "from": "+905322223333",
  "message": "İmplant için randevu almak istiyorum",
  "timestamp": "2026-07-06T15:30:00+03:00"
}

Expected current response shape:

{
  "status": "received",
  "channel": "whatsapp",
  "from": "+905322223333",
  "intent": "appointment_request",
  "requires_handoff": false,
  "reply_draft": "İmplant randevusu için uygun saatleri kontrol ediyorum."
}

## Current boundaries

The current messaging inbound flow does not:

- Connect to a real WhatsApp provider
- Verify a WhatsApp webhook signature
- Send outbound WhatsApp messages
- Store messages in a database
- Use authentication
- Create appointments
- Sync appointments to calendar providers
- Touch secretary manual appointment flow
- Use real patient data

This is deliberate. The current goal is only to prove that an inbound messaging payload can enter the system, be validated, classified, and return a safe reply draft.

## Safety rules

Never commit:
- .env
- credentials.json
- token.json
- service-account.json
- oravia-secrets
- Google private key content
- Real patient data

Demo payloads must use fake patient data only.

Real Google Calendar tests must be explicit and manually cleaned after use.

For mock appointment demo runs, use:

CALENDAR_PROVIDER=mock npm run demo:appointment

Do not mistype CALENDAR_PROVIDER. A typo can accidentally fall back to the .env provider and create a real Google Calendar event.

## Demo commands

Run messaging inbound demo:

npm run demo:messaging-inbound

Run all tests:

npm test

Run environment safety check:

npm run check:env

Run appointment demo in mock mode:

CALENDAR_PROVIDER=mock npm run demo:appointment

## Next likely sprint

Sprint 10E should define the next messaging-agent step before connecting a real WhatsApp provider.

Recommended next scope:
- Conversation state planning
- Handoff rules
- Message direction model: inbound vs outbound
- What patient data can be stored later
- What data must remain demo-only for now

Do not connect real WhatsApp until these boundaries are clear.
