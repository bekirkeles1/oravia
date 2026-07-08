# Oravia Agent Capability Map

## 1. Product promise

Oravia is not only an appointment booking tool.

The product promise is:

Oravia acts like a smart dental clinic assistant that can talk to patients, answer common questions, guide appointment demand, support the secretary, and help the clinic bring patients back at the right time.

The dashboard is internal-only.

Patients should interact with Oravia through WhatsApp / messaging channels, not through a patient-facing dashboard.

## 2. Core product differentiation

Many dental clinics already have some kind of reservation system.

Oravia must be more valuable than a calendar screen.

The sellable value is:

- It answers patient questions quickly.
- It guides patients toward booking.
- It reduces secretary workload.
- It supports treatment-specific conversations.
- It can trigger follow-up and reminder campaigns.
- It can help clinics reactivate old patients.
- It creates a smarter patient communication layer around the existing clinic operation.

A weak version of Oravia only records appointments.

A strong version of Oravia behaves like a trained dental assistant.

## 3. Current implemented messaging foundation

Currently implemented:

- Pure inbound messaging handler: src/api/messagingInboundHandler.js
- API route: POST /api/messaging/inbound
- Route file: app/api/messaging/inbound/route.js
- Demo command: npm run demo:messaging-inbound
- Local intent classifier reuse
- Payload validation
- Reply draft generation
- Unknown intent handoff response

Current messaging flow:

Inbound message -> validation -> intent classification -> reply draft -> handoff decision

Current scope is intentionally inbound-only.

## 4. Bot capabilities target

The Oravia Agent should eventually support these capability areas:

### Treatment information

The bot should answer common dental treatment questions such as:

- What is an implant?
- Does implant treatment hurt?
- How long does implant treatment take?
- What is dental cleaning?
- How often should dental cleaning be done?
- What is teeth whitening?
- What is root canal treatment?
- What is filling treatment?
- What is orthodontic treatment?
- What should the patient expect before and after common treatments?

The bot should provide general information, not medical diagnosis.

### Appointment guidance

The bot should help patients move toward an appointment by:

- Detecting appointment intent
- Asking missing appointment details
- Offering available days
- Offering available times
- Matching treatment interest to suitable doctors
- Preparing appointment requests for the clinic team
- Eventually creating appointments after safe confirmation rules exist

### Doctor availability

The bot should eventually answer:

- Which doctors are available?
- Which doctor handles which treatment?
- Which days are available?
- Which time slots are available?
- Is there availability tomorrow?
- Is there availability after work hours?

This must be connected to controlled availability data, not guessed.

### Pricing guidance

The bot should eventually answer pricing questions using clinic-approved rules.

Possible response types:

- Exact price, only if clinic policy allows it
- Price range, only if clinic policy allows it
- “Net price requires examination”
- “The secretary can share current campaign details”
- “I can help you book an examination for a clear treatment plan”

The bot must not invent prices.

### Clinic information

The bot should answer clinic information such as:

- Address
- Phone number
- Working hours
- Directions
- Parking notes
- Nearby transportation notes
- Accepted communication channels

### Campaign and reminder support

The bot should eventually support proactive reminders and campaigns.

Example:

A patient had dental cleaning one year ago.

The system can prepare a message such as:

“Merhaba, son diş taşı temizliğinizin üzerinden 1 yıl geçti. Bu ay diş taşı temizliği için %20 indirimimiz var. Randevu oluşturmak ister misiniz?”

This is a major commercial value point.

It turns Oravia from a passive chatbot into a patient reactivation assistant.

## 5. Bot non-capabilities

The bot must not:

- Diagnose a patient
- Claim a patient is suitable for a treatment without examination
- Prescribe medication
- Give emergency medical instructions beyond safe referral
- Invent prices
- Invent doctor availability
- Invent appointment confirmations
- Create real calendar events without explicit appointment flow
- Use real patient data in demo mode
- Promise guaranteed outcomes
- Replace doctor judgment
- Continue risky medical conversations without handoff

## 6. Knowledge sources

The bot should not rely only on a generic language model.

The answer should be grounded in controlled Oravia modules.

## 6A. Assistant core and vertical boundary

Oravia is now treated as an assistant engine plus a dental clinic vertical.

Assistant core should own generic assistant concepts such as message intake,
intent routing, reply planning interfaces, handoff interfaces, slot proposal
interfaces, appointment flow state, and provider contracts.

Dental-specific knowledge should stay behind the dental vertical boundary. The
current adapter lives at `src/verticals/dental/dentalVertical.js` and is
registered through `src/assistant/verticalRegistry.js`. It exposes existing
dental modules for treatment knowledge, handoff rules, doctor directory,
doctor availability, treatment duration rules, and appointment purpose rules
without duplicating their business logic.

The currently expected messaging capabilities are documented in code by
`src/assistant/verticalContract.js`, which lets tests validate vertical
adapters without forcing broad runtime enforcement yet.

Future knowledge sources:

### clinicProfile

Contains:

- Clinic name
- Address
- Phone
- Working hours
- Location notes
- Parking notes
- Communication rules

### doctorDirectory

Contains:

- Doctor names
- Specialties
- Services handled
- Working days
- Available appointment windows
- Handoff preferences

### treatmentKnowledgeBase

Contains clinic-approved explanations for:

- Implant
- Dental cleaning
- Teeth whitening
- Root canal treatment
- Filling
- Tooth extraction
- Orthodontics
- General examination

### pricingPolicy

Contains:

- Which treatments can show exact price
- Which treatments can show price range
- Which treatments require examination first
- Campaign rules
- Discount wording
- Price disclaimer wording

### campaignRules

Contains:

- Dental cleaning yearly reminder
- Discount eligibility
- Last visit based triggers
- Last treatment based triggers
- Do-not-contact rules
- Campaign expiry rules

### patientHistory

Future module.

Contains:

- Patient id
- Phone number
- Last treatment
- Last visit date
- Last contacted date
- Campaign eligibility
- Consent status
- Notes safe for messaging

This should not be implemented with real data until database, consent, privacy, and security rules are clear.

## 7. Treatment answer policy

The bot can give general treatment information.

Allowed:

- Explain what a treatment is
- Explain common steps
- Explain that examination is needed for suitability
- Explain typical appointment flow
- Explain aftercare in general terms if clinic-approved
- Suggest booking an examination

Not allowed:

- Diagnosis
- Treatment suitability decision
- Medication instruction
- Emergency handling beyond referral
- Guaranteed outcome
- Specific clinical decision

Safe treatment answer style:

“Bu konuda genel bilgi verebilirim. Net tedavi planı ve uygunluk için hekimin muayenesi gerekir.”

## 8. Pricing answer policy

The bot must follow pricing policy.

Allowed:

- Share exact price only if clinic-approved data exists
- Share price range only if clinic-approved data exists
- Say price depends on examination
- Offer appointment for examination
- Mention campaign only if campaign rule exists

Not allowed:

- Guess prices
- Promise discount without rule
- Negotiate price
- Give final treatment cost without examination when treatment depends on clinical condition

Safe pricing answer style:

“Net fiyat, muayene ve tedavi planından sonra belirlenir. İsterseniz uygun muayene saatlerini kontrol edebilirim.”

## 9. Appointment answer policy

The bot can guide appointment demand.

Current state:

- Messaging inbound only
- No real appointment creation from messaging
- No calendar sync from messaging

Future state:

- Collect treatment interest
- Collect preferred day
- Collect preferred time
- Check availability
- Offer slots
- Confirm selected slot
- Create appointment only after explicit confirmation
- Sync calendar only through approved provider path

The bot must not say an appointment is confirmed unless the appointment creation flow actually succeeded.

## 10. Campaign and reminder policy

Campaigns are a major product value.

Example campaign:

Dental cleaning yearly reminder.

Eligibility example:

- Patient had dental cleaning at least 365 days ago
- Patient has valid phone number
- Patient has not opted out
- Patient was not contacted recently for the same campaign
- Campaign is active
- Discount is clinic-approved

Example output:

“Merhaba, son diş taşı temizliğinizin üzerinden 1 yıl geçti. Bu ay diş taşı temizliği için %20 indirimimiz var. Randevu oluşturmak ister misiniz?”

Future campaign module should return:

- eligible: true / false
- campaign_id
- reason
- message_draft
- requires_handoff
- suggested_next_action

## 11. Handoff rules

The bot should hand off to secretary or doctor when:

- Patient asks for diagnosis
- Patient reports severe pain
- Patient reports swelling
- Patient reports bleeding
- Patient asks medication questions
- Patient asks for urgent medical advice
- Patient is angry or dissatisfied
- Patient asks for exact price when policy does not allow exact price
- Patient asks something outside known clinic data
- Intent confidence is low
- Patient wants human contact
- Appointment flow becomes ambiguous

Handoff is not failure.

Handoff is a safety and trust feature.

## 12. Future module map

Recommended future modules:

src/clinic/clinicProfile.js
src/clinic/doctorDirectory.js
src/clinic/treatmentKnowledgeBase.js
src/clinic/pricingPolicy.js
src/clinic/campaignRules.js

src/messaging/conversationState.js
src/messaging/replyPlanner.js
src/messaging/handoffRules.js
src/messaging/messageDirection.js

src/patients/patientHistoryMock.js

Future API path remains:

POST /api/messaging/inbound

The API should stay thin.

Business logic should stay in src modules.

## 13. Recommended next sprint order

Recommended next sprint sequence:

1. Sprint 10F - Clinic knowledge base mock module
2. Sprint 10G - Reply planner
3. Sprint 10H - Handoff rules
4. Sprint 10I - Conversation state mock
5. Sprint 10J - Campaign reminder rules mock
6. Sprint 10K - Availability bridge for messaging intent

Do not connect real WhatsApp before the agent behavior, handoff boundaries, and knowledge sources are stable.

## 14. Success definition

Oravia becomes commercially strong when it can:

- Answer common dental questions safely
- Route uncertain cases to clinic staff
- Offer appointment guidance
- Use clinic-approved price and treatment data
- Use availability data instead of guessing
- Reactivate old patients through reminders
- Reduce secretary workload
- Increase patient conversion

The goal is not to build a generic chatbot.

The goal is to build a controlled, clinic-aware, revenue-supporting dental assistant.
