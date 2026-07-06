# Oravia — Master Product Blueprint v0.1

## 1. Product Identity

### Product Name

Oravia

### First Product Line

Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard

### One-Line Description

Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard is an AI receptionist system for dental clinics that works through messaging channels, understands patient messages, checks doctor availability, offers suitable slots, creates appointments, routes handoffs to clinic staff, and gives doctors, secretaries, and owners an internal operations dashboard.

### Turkish Positioning

Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard, diş klinikleri için WhatsApp ve gelecekteki mesajlaşma kanalları üzerinden çalışan yapay zekâ destekli dijital sekreter ajanı ve klinik operasyon panelidir. Hastalardan gelen mesajları anlar, uygun randevu saatlerini sunar, randevu oluşturur, gerektiğinde konuşmayı klinik ekibine devreder ve doktor, sekreter, yönetici/klinik sahibi için ayrı operasyon görünümleri sağlar.

### Product Role Definition

Oravia is agent-first.

The product is not a patient-facing dashboard booking app.

The product roles are:

* Patient-facing experience: a messaging channel such as WhatsApp now, and future chat channels later.
* AI agent core: understands patient messages, answers using clinic-approved information, offers available slots, creates appointments, and handles human handoff.
* Dashboard: role-based clinic operations for doctors, secretaries, and admin/owners, plus monitoring, configuration, handoff visibility, and local demo tools.

### Agent-First Product Direction

Oravia must be understood as:

Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard.

The AI receptionist agent is the core product. It handles patient communication through messaging channels, not through a patient dashboard.

The role-based dashboard is the internal operations layer for clinic staff. It helps the clinic monitor, edit, and coordinate work created by the agent and by clinic staff.

Product boundaries:

* Patients interact with Oravia through WhatsApp or future messaging channels.
* The AI agent understands messages, offers slots, creates appointments, and requests handoff when needed.
* Doctors use the dashboard to see clinical schedule context and AI conversation summaries.
* Secretaries use the dashboard to manage daily operations, manual phone-call appointment entry, edits, cancellations, handoffs, and calendar sync status.
* Admin/owners use the dashboard to monitor volume, occupancy, handoff rate, and conversion indicators.
* The dashboard is not a public patient booking portal.

---

## 2. Core Business Problem

Dental clinics receive repetitive patient messages every day through WhatsApp, Instagram, phone calls, and website forms.

Most of these messages are not complex medical conversations. They are repetitive operational questions such as:

* “İmplant fiyatı nedir?”
* “Bugün müsaitlik var mı?”
* “Doktor bey/hanım hangi gün klinikte?”
* “Randevu almak istiyorum.”
* “Randevumu değiştirebilir miyim?”
* “Diş beyazlatma yapıyor musunuz?”
* “Konum atabilir misiniz?”

These messages consume clinic staff time, slow down patient response speed, and cause missed appointment opportunities.

The main problem is not lack of software.

The main problem is that clinic staff still manually handle repetitive patient communication.

---

## 3. Product Promise

Oravia does not replace clinic staff.

Oravia reduces the repetitive workload of clinic staff.

The product promise is:

“Sekreterinizin gününü tüketen tekrar eden WhatsApp işlerini otomatikleştiriyoruz.”

Oravia helps dental clinics:

* Respond faster to patient messages
* Reduce missed appointment opportunities
* Automate appointment scheduling
* Reduce repetitive WhatsApp workload
* Keep doctor availability organized
* Improve patient experience before the first visit

---

## 4. Target Customer

### Initial Target Segment

Small and medium-sized dental clinics in Türkiye.

### Ideal First Customer Profile

The first target customer should be a dental clinic that:

* Has 2 to 10 dentists
* Uses WhatsApp actively for patient communication
* Receives at least 20 patient messages per day
* Has a receptionist or front desk staff
* Manages appointments manually or semi-manually
* Does not have a strong automated patient communication system
* Wants more appointments without hiring extra staff

### Non-Target Customers for MVP

The MVP will not target:

* Large hospital chains
* Clinics without WhatsApp usage
* Solo dentists with very low message volume
* Clinics that only want a full clinic management system
* Clinics that require complex insurance or payment integrations

---

## 5. MVP Scope

The first version of Oravia Dental AI Receptionist Agent will include only the following four core functions:

### 1. WhatsApp Message Intake

The system receives incoming WhatsApp messages from patients.

### 2. AI Response

The system understands the patient’s intent and replies based on clinic-approved information.

### 3. Doctor Availability Check

The system checks doctor availability from a connected calendar.

### 4. Appointment Creation

The system creates an appointment after the patient selects a suitable time.

### Dashboard is not the primary patient booking surface

Patients should not book appointments through the dashboard.

The dashboard exists for clinic/admin workflows only:

* Monitor conversations and appointment outcomes
* Configure clinic information, doctors, working hours, and clinic-approved answers
* Review human handoff cases
* Verify calendar connection and system health
* Run local demo/admin tools for sales and testing

The core patient appointment experience must happen inside a messaging channel. For the MVP, this means WhatsApp when the integration is added. Until WhatsApp is connected, local dashboard actions are admin/demo tools that simulate or verify the agent flow.

### Patient-Facing Experience

Patients interact with Oravia through messaging channels.

The primary patient-facing channel will be WhatsApp. Future channels may include website chat, Instagram DM, or other messaging surfaces.

Patient-facing behavior:

* Patient sends a message in a messaging channel.
* Oravia understands the request.
* Oravia replies in the same channel.
* Oravia offers suitable appointment slots in the conversation.
* Patient chooses a time in the conversation.
* Oravia creates the appointment after a clear slot selection.
* Oravia confirms the appointment in the conversation.
* Oravia hands off to clinic staff when the conversation requires human review.

The patient should not need access to the clinic operations dashboard.

### Clinic Staff Dashboard Roles

The dashboard is a role-based clinic operations dashboard for doctors, secretaries, and admin/owners.

It is not a full CRM and should stay focused on appointment operations, conversation monitoring, handoffs, and clinic configuration.

#### Doctor View

Doctor View should help dentists understand their schedule and patient context quickly.

Doctor View includes:

* Today’s appointments
* Weekly appointments
* Patient notes
* Treatment interest
* AI conversation summary
* Appointment status

#### Secretary View

Secretary View should support daily front-desk operations.

Secretary View includes:

* Today’s operations
* Phone-call appointment entry
* Manual appointment editing
* Appointment cancellation
* Handoff queue
* Doctor availability view
* Google Calendar sync status

#### Admin / Owner View

Admin / Owner View should show operational performance without becoming a complex analytics product.

Admin / Owner View includes:

* Appointment volume
* AI-generated appointments
* Phone-call appointments
* Handoff rate
* Doctor occupancy
* Conversion indicators

### Secretary Manual Appointment Desk

Secretaries must be able to add phone-call appointments manually.

This is necessary because not every patient appointment starts in WhatsApp. Many dental clinics still receive appointment requests by phone, walk-in, Instagram DM, or direct staff communication.

The Secretary Manual Appointment Desk should allow clinic staff to:

* Create a new appointment from a phone call
* Choose doctor, date, time, and duration
* Add patient name and phone number
* Add treatment interest and notes
* Edit appointment details later
* Cancel appointments when needed
* See whether the appointment is synced to Google Calendar

Manual appointment records should include:

* patient_name
* patient_phone
* treatment_interest
* doctor_id
* appointment_date
* appointment_time
* duration_minutes
* source: phone_call | ai_agent | walk_in | instagram_dm | manual
* created_by: secretary | ai | admin
* status: confirmed | pending | cancelled
* notes
* calendar_provider
* calendar_event_id
* sync_status

### Google Calendar Sync Rules

Google Calendar is the background calendar sync layer.

The Oravia dashboard should remain the main clinic operations screen. Clinic staff should use Oravia to monitor operations, add manual phone-call appointments, edit appointments, cancel appointments, and track sync status.

Google Calendar sync rules:

* A new manual appointment should create a Google Calendar event.
* Appointment edits should update the matching Google Calendar event.
* Appointment cancellations should sync to Google Calendar.
* AI-generated appointments should continue to create calendar events after patient confirmation.
* The dashboard should show calendar_provider, calendar_event_id, and sync_status.
* If sync fails, the dashboard should surface the failure to the secretary/admin without exposing secrets.
* Google Calendar should not replace the dashboard as the daily operations screen.

---

## 6. MVP User Scenario

A patient sends a WhatsApp message:

“Merhaba, implant için randevu almak istiyorum.”

Oravia replies:

“Merhaba, yardımcı olmaktan memnuniyet duyarım. İmplant muayenesi için uygun randevu saatlerini kontrol ediyorum.”

The system checks doctor availability.

Oravia sends available options:

“Yarın 14:00, 16:30 veya Çarşamba 11:00 uygun görünüyor. Hangisi sizin için uygundur?”

Patient replies:

“Yarın 16:30 uygun.”

Oravia creates the appointment in the clinic calendar.

Oravia confirms:

“Randevunuz yarın saat 16:30 için oluşturuldu. Klinik adresimiz: [adres]. Randevudan önce sizi tekrar bilgilendireceğiz.”

The clinic staff receives the appointment information.

MVP success is achieved if this full flow works reliably.

---

## 7. What We Will Not Build in MVP

The first version will not include:

* Online payment
* Patient mobile app
* Doctor mobile app
* Full CRM system
* Instagram DM automation
* Voice AI
* Phone call answering
* Campaign management
* Advanced reporting
* Multi-branch clinic management
* Insurance integrations
* E-prescription
* Medical diagnosis
* Treatment recommendation engine

These features are intentionally excluded to keep the MVP focused, sellable, and buildable with limited time and budget.

---

## 8. Success Criteria

The MVP will be considered successful when:

1. A patient can send a WhatsApp message.
2. The system can understand the message intent.
3. The AI can respond safely using clinic-approved information.
4. The system can check doctor availability.
5. The patient can choose a time.
6. The appointment is created in the calendar.
7. The clinic receives the appointment details.
8. The full flow can be demonstrated to a real dental clinic.

The first business milestone is not “perfect product.”

The first business milestone is:

One dental clinic agrees to test or pay for Oravia.

---

## 9. Business Model

Oravia will use a setup fee plus monthly subscription model.

### Initial Pricing Hypothesis

Setup Fee:

15,000 TL – 30,000 TL

Monthly Subscription:

2,500 TL – 5,000 TL

### First Customer Offer

For the first pilot customer, pricing may be reduced in exchange for:

* Real clinic testing
* Testimonial
* Permission to use anonymized results
* Product feedback
* Referral to another clinic

---

## 10. Strategic Rule

Every feature must pass this question:

“Does this help us win the first paying dental clinic?”

If the answer is no, the feature is postponed.

The project will not chase complexity.

The project will chase the first real customer.
---

## 11. Technical Architecture v0.1

Oravia will be built as a simple, modular SaaS system.

The first version must be easy to understand, easy to test, and easy to modify.

The architecture will prioritize speed, reliability, and low cost over technical complexity.

### Core Components

Oravia MVP will use the following core components:

1. Messaging channel adapter
2. Backend application
3. AI receptionist agent core
4. Clinic knowledge base
5. Calendar availability system
6. Appointment creation system
7. Human handoff workflow
8. Basic clinic/admin dashboard
9. Database

### Agent-first architecture

Oravia should be designed around the AI receptionist agent, not around dashboard booking forms.

The main product loop is:

Patient message -> AI agent understanding -> safe reply or handoff decision -> availability check -> slot offer in the messaging channel -> patient selects a time -> calendar appointment creation -> confirmation message -> clinic/admin dashboard visibility.

Architecture responsibilities:

* Messaging channel: receives patient messages and sends agent replies.
* AI agent core: classifies intent, extracts safe operational details, decides next action, drafts replies, and requests handoff when needed.
* Calendar layer: checks availability, prevents double-booking, and creates calendar events only after a confirmed slot.
* Dashboard: monitors agent activity, displays appointments and conversations, manages configuration, and provides demo/admin controls.

Dashboard actions must never become the primary patient booking path. They may trigger demo flows or admin-only workflows, but patient-facing booking belongs to the messaging agent.

### Future WhatsApp integration path

WhatsApp should be connected only after the local agent flow is reliable.

The future integration path is:

1. Configure WhatsApp Business Cloud API for a demo clinic/test number.
2. Receive incoming webhook messages from WhatsApp.
3. Normalize incoming messages into the internal agent message format.
4. Route the message through the AI agent core.
5. Send the agent reply, slot options, handoff notice, or confirmation back through WhatsApp.
6. Store conversation and appointment records when the database layer is introduced.
7. Show the resulting conversation, handoff state, and appointment outcome in the dashboard for clinic staff.

Do not connect WhatsApp before the local agent demo, calendar flow, safety rules, and handoff behavior are stable.

---

## 12. Recommended MVP Technology Stack

### Frontend

Next.js

Purpose:

* Build the clinic/admin dashboard
* Monitor patient conversations handled by the agent
* View appointments created by the agent
* Configure clinic information
* Configure doctors and working hours
* Review handoff cases and demo/admin tools

The frontend dashboard is not the patient booking surface.

### Backend

Next.js API routes or standalone Node.js backend

Purpose:

* Receive WhatsApp webhook events
* Process incoming messages
* Call AI model
* Check calendar availability
* Create appointments
* Save conversation records

### Database

Supabase PostgreSQL

Purpose:

* Store clinics
* Store doctors
* Store patients
* Store conversations
* Store appointments
* Store clinic-approved answers

### AI Provider

OpenAI API

Purpose:

* Understand patient messages
* Generate safe replies
* Classify patient intent
* Extract appointment details

### Calendar

Google Calendar API

Purpose:

* Check doctor availability
* Create appointment events
* Prevent double-booking

### WhatsApp

WhatsApp Business Cloud API

Purpose:

* Receive patient WhatsApp messages
* Send AI-generated replies
* Send appointment confirmations

### Deployment

Vercel for the web application.

Later, if background jobs become necessary, the backend can be moved to Railway, Render, or another server environment.

---

## 13. MVP System Flow

The first working flow will be:

Patient sends WhatsApp message.

↓

WhatsApp sends webhook event to Oravia backend.

↓

Backend saves the incoming message.

↓

Backend sends the message to AI engine.

↓

AI detects intent.

Possible intents:

* General question
* Treatment price question
* Appointment request
* Appointment change request
* Clinic location request
* Human handoff request
* Unknown intent

↓

If the patient wants an appointment, backend checks doctor availability.

↓

Available time slots are sent to the patient.

↓

Patient selects a time.

↓

Backend creates appointment in Google Calendar.

↓

Appointment is saved in database.

↓

Confirmation message is sent to patient.

↓

Clinic staff can view the agent-created appointment in the dashboard.

The patient does not use the dashboard in this flow.

---

## 14. MVP Safety Rules

The AI must not provide medical diagnosis.

The AI must not recommend treatment as a doctor.

The AI must not guarantee exact prices unless clinic-approved pricing exists.

The AI must not give emergency medical instructions beyond directing the patient to contact the clinic or emergency services.

The AI must always stay within clinic-approved information.

The AI should escalate to human staff when:

* The patient describes severe pain
* The patient mentions bleeding, swelling, trauma, or emergency
* The patient asks for medical diagnosis
* The patient becomes angry
* The AI is unsure
* The patient requests a human

---

## 15. First Version Design Principle

The first version must be boring but reliable.

No unnecessary animations.

No complex dashboard.

No advanced analytics.

No mobile application.

No payment system.

No Instagram integration.

No phone AI.

The first version only needs to prove one thing:

A dental clinic can receive a WhatsApp message, let Oravia respond, check availability, and create an appointment automatically.
---

## 16. Database Design v0.1

The database must be simple, scalable, and easy for an AI coding assistant to understand.

The MVP database will be built around the following core entities:

1. Clinics
2. Doctors
3. Patients
4. Conversations
5. Messages
6. Appointments
7. Clinic Knowledge Base
8. Handoffs

---

## 17. Table: clinics

The `clinics` table stores each dental clinic using Oravia.

### Purpose

A clinic is the main customer account in the system.

### Fields

* id
* name
* phone
* whatsapp_phone
* email
* address
* timezone
* status
* created_at
* updated_at

### Example

A clinic record may represent:

“Oravia Demo Dental Clinic”

---

## 18. Table: doctors

The `doctors` table stores dentists working inside a clinic.

### Purpose

Doctors are connected to clinic appointments and availability.

### Fields

* id
* clinic_id
* name
* title
* specialty
* google_calendar_id
* active
* created_at
* updated_at

### Notes

Each doctor belongs to one clinic.

Each doctor may have a connected Google Calendar.

For the MVP, a clinic may start with only one doctor.

---

## 19. Table: patients

The `patients` table stores people who contact the clinic.

### Purpose

Patients are identified mainly by their WhatsApp phone number.

### Fields

* id
* clinic_id
* full_name
* phone
* whatsapp_id
* first_contact_at
* last_contact_at
* created_at
* updated_at

### Notes

For MVP, the phone number is more important than the name.

If the patient does not provide a name, the system can still continue the conversation.

---

## 20. Table: conversations

The `conversations` table groups messages between a patient and the AI receptionist.

### Purpose

A conversation represents one continuous WhatsApp interaction.

### Fields

* id
* clinic_id
* patient_id
* status
* current_intent
* last_message_at
* created_at
* updated_at

### Possible Status Values

* active
* waiting_for_patient
* appointment_created
* handed_off_to_human
* closed

---

## 21. Table: messages

The `messages` table stores each individual message.

### Purpose

Every incoming and outgoing message should be saved for context, debugging, and clinic review.

### Fields

* id
* conversation_id
* clinic_id
* patient_id
* direction
* sender_type
* content
* raw_payload
* created_at

### Direction Values

* inbound
* outbound

### Sender Type Values

* patient
* ai
* staff
* system

### Notes

The raw WhatsApp webhook payload may be stored for debugging during MVP development.

---

## 22. Table: appointments

The `appointments` table stores appointment records created by the Oravia AI agent or manually by clinic staff.

### Purpose

Appointments connect patients, doctors, clinics, and calendar events.

### Fields

* id
* clinic_id
* doctor_id
* patient_id
* patient_name
* patient_phone
* conversation_id
* treatment_interest
* doctor_id
* appointment_date
* appointment_time
* duration_minutes
* start_time
* end_time
* source
* status
* created_by
* notes
* calendar_provider
* calendar_event_id
* sync_status
* created_at
* updated_at

### Possible Status Values

* pending
* confirmed
* cancelled
* completed
* no_show

### Created By Values

* ai
* secretary
* admin

### Source Values

* phone_call
* ai_agent
* walk_in
* instagram_dm
* manual

### Sync Status Values

* not_synced
* synced
* sync_failed
* pending_sync

### Notes

For MVP, Oravia should create AI-agent appointments only after the patient clearly selects a time.

Secretaries should be able to create manual appointments from phone calls in a later sprint.

The system must avoid double-booking.

Manual appointment create, edit, and cancellation flows should sync to Google Calendar when the Google Calendar provider is configured.

---

## 23. Table: clinic_knowledge_base

The `clinic_knowledge_base` table stores clinic-approved information that the AI can use.

### Purpose

The AI should not invent clinic information.

It should answer based on approved knowledge.

### Fields

* id
* clinic_id
* category
* question
* answer
* active
* created_at
* updated_at

### Example Categories

* implant
* whitening
* pricing
* location
* working_hours
* doctors
* emergency
* general

### Example

Question:

“İmplant fiyatı nedir?”

Answer:

“İmplant fiyatları hastanın durumuna göre değişebilir. Net bilgi için muayene gereklidir. Uygun bir randevu oluşturmama ister misiniz?”

---

## 24. Table: handoffs

The `handoffs` table stores situations where the AI transfers the conversation to clinic staff.

### Purpose

Some conversations should not be handled by AI.

### Fields

* id
* clinic_id
* patient_id
* conversation_id
* reason
* status
* created_at
* resolved_at

### Example Handoff Reasons

* medical_emergency
* angry_patient
* price_dispute
* human_requested
* ai_uncertain
* complex_medical_question

### Possible Status Values

* open
* resolved
* ignored

---

## 25. Database Rules

The database must follow these rules:

1. Every patient belongs to a clinic.
2. Every doctor belongs to a clinic.
3. Every appointment belongs to a clinic.
4. Every appointment should connect to a patient.
5. Every conversation should connect to a patient.
6. Every message should connect to a conversation.
7. The AI should only use active clinic knowledge base records.
8. Deleted records should be avoided in MVP; use status fields instead.
9. Timestamps should be stored consistently.
10. The system should be designed for multiple clinics, even if the first demo uses only one clinic.

---

## 26. MVP Database Priority

The first development version only needs these tables to work:

1. clinics
2. doctors
3. patients
4. conversations
5. messages
6. appointments
7. clinic_knowledge_base

The `handoffs` table can be added early but does not need a full dashboard in MVP.

---

## 27. Database Design Principle

The database should not try to model every detail of a real dental clinic.

The first database only needs to support the core product promise:

A patient sends a WhatsApp message.

Oravia replies safely.

Oravia checks doctor availability.

Oravia creates an appointment.

The clinic can see what happened.
---

## 28. AI Receptionist Behavior v0.1

Oravia AI must behave like a professional dental clinic receptionist.

It must not behave like a dentist.

It must not diagnose.

It must not recommend medical treatment.

Its main job is to understand the patient request, answer using clinic-approved information, and guide the patient toward an appointment when appropriate.

---

## 29. AI Role Definition

The AI role is:

“Dental clinic front desk assistant.”

The AI can:

* Welcome patients
* Ask basic clarification questions
* Answer clinic-approved frequently asked questions
* Share clinic address and working hours
* Explain that pricing may vary depending on examination
* Offer suitable appointment times
* Create appointment requests
* Escalate risky situations to human staff

The AI cannot:

* Diagnose dental problems
* Prescribe medication
* Recommend a specific treatment
* Guarantee treatment success
* Give exact medical advice
* Replace a dentist examination
* Handle emergencies alone

---

## 30. AI Tone of Voice

The AI should sound:

* Professional
* Calm
* Helpful
* Short and clear
* Trustworthy
* Human-like but not overly casual

The AI should not sound:

* Robotic
* Too salesy
* Too long-winded
* Medical expert-like
* Pushy
* Cold

### Turkish Tone Example

“Merhaba, yardımcı olmaktan memnuniyet duyarım. İmplant tedavisi için net bilgi genellikle muayene sonrası verilebilir. Dilerseniz sizin için uygun randevu saatlerini kontrol edebilirim.”

---

## 31. Allowed AI Actions

The AI is allowed to:

1. Identify the patient’s intent.
2. Ask for missing basic information.
3. Use clinic-approved knowledge base answers.
4. Offer available appointment slots.
5. Confirm appointment details.
6. Save patient contact information.
7. Escalate to human staff when necessary.

---

## 32. Forbidden AI Actions

The AI must never:

1. Diagnose the patient.
2. Say “You need implant treatment.”
3. Say “This pain is caused by...”
4. Prescribe medication.
5. Suggest antibiotics or painkillers.
6. Give exact price unless approved by the clinic.
7. Promise same-day treatment.
8. Promise guaranteed results.
9. Make medical decisions.
10. Continue handling emergency cases without human escalation.

---

## 33. Intent Categories

The MVP AI should classify incoming patient messages into one of these intent categories:

### appointment_request

The patient wants to book an appointment.

Example:

“Randevu almak istiyorum.”

### treatment_price_question

The patient asks about treatment price.

Example:

“İmplant fiyatı ne kadar?”

### treatment_information_question

The patient asks general treatment information.

Example:

“Diş beyazlatma yapıyor musunuz?”

### clinic_location_question

The patient asks for clinic address or location.

Example:

“Konum atar mısınız?”

### doctor_availability_question

The patient asks about doctor availability.

Example:

“Doktor bugün klinikte mi?”

### appointment_change_request

The patient wants to change or cancel an appointment.

Example:

“Randevumu değiştirmek istiyorum.”

### emergency_or_pain

The patient describes severe pain, bleeding, swelling, trauma, or urgent symptoms.

Example:

“Dişim çok şişti ve ağrıyor.”

### human_requested

The patient wants to talk to a real person.

Example:

“Biriyle görüşebilir miyim?”

### unknown

The AI cannot confidently understand the message.

---

## 34. Appointment Conversation Rules

When the patient wants an appointment, the AI should collect only the minimum information needed.

Minimum required information:

* Patient name, if available
* Treatment interest
* Preferred day or time, if mentioned
* Phone number is already known from WhatsApp

The AI should not ask too many questions before offering appointment options.

Bad behavior:

“Adınız, soyadınız, yaşınız, şikayetiniz, doktor tercihiniz, daha önce tedavi oldunuz mu?”

Good behavior:

“Elbette. İmplant muayenesi için uygun saatleri kontrol ediyorum. Yarın 14:00 veya 16:30 sizin için uygun olur mu?”

---

## 35. Price Question Rules

When the patient asks for price, the AI should avoid exact promises unless the clinic has approved fixed pricing.

Preferred answer:

“Fiyatlar hastanın durumuna ve yapılacak işleme göre değişebilir. Net bilgi için muayene gereklidir. Dilerseniz sizin için uygun bir muayene randevusu oluşturabilirim.”

The AI should always guide price questions toward appointment creation.

---

## 36. Emergency Escalation Rules

If the patient mentions severe pain, bleeding, swelling, trauma, infection, fever, or urgent symptoms, the AI must escalate.

Example response:

“Geçmiş olsun. Anlattığınız durum acil değerlendirme gerektirebilir. Sizi klinik ekibimize yönlendiriyorum. En kısa sürede sizinle iletişime geçilecektir. Acil bir durum olduğunu düşünüyorsanız lütfen en yakın sağlık kuruluşuna başvurun.”

The conversation status should be marked as handed_off_to_human.

A handoff record should be created.

---

## 37. Human Handoff Rules

The AI should hand off to human staff when:

* Patient asks for human staff
* Patient is angry
* Patient asks complex medical questions
* Patient reports emergency symptoms
* Patient asks legal, payment dispute, or complaint questions
* AI confidence is low

The AI should not pretend to know.

Safe response:

“Bu konuda size en doğru bilgiyi klinik ekibimiz verebilir. Görüşmeyi ekibimize aktarıyorum.”

---

## 38. AI Output Format for Backend

When the backend asks the AI to classify a message, the AI should return structured JSON.

Example:

{
"intent": "appointment_request",
"confidence": 0.92,
"requires_handoff": false,
"patient_message_summary": "Patient wants an implant appointment.",
"extracted_data": {
"treatment_interest": "implant",
"preferred_day": "tomorrow",
"preferred_time": null
},
"reply": "Elbette, implant muayenesi için uygun saatleri kontrol ediyorum."
}

The backend should not rely only on free-text AI replies.

The backend should use structured intent and extracted data to decide the next action.

---

## 39. AI Design Principle

The AI should optimize for:

1. Safety
2. Clarity
3. Appointment conversion
4. Low staff workload
5. Patient trust

The AI should not optimize for:

1. Long conversations
2. Medical authority
3. Aggressive sales
4. Complex diagnosis
5. Replacing clinic staff completely
---

## 40. MVP Workflow Design v0.1

This section defines the exact operating workflow of Oravia MVP.

The MVP must be built around one primary workflow:

Patient WhatsApp message → AI understanding → availability check → appointment creation → confirmation.

No other workflow should be prioritized before this one works reliably.

---

## 41. Primary Workflow: Appointment Creation

### Step 1 — Patient Sends WhatsApp Message

A patient sends a WhatsApp message to the clinic.

Example:

“Merhaba, implant için randevu almak istiyorum.”

The system receives the message through WhatsApp Business Cloud API webhook.

The backend must save the raw incoming message.

The backend must either find an existing patient by WhatsApp phone number or create a new patient record.

---

### Step 2 — Conversation Is Created or Updated

If there is no active conversation for this patient, the backend creates a new conversation.

If there is an active conversation, the backend attaches the message to the existing conversation.

The message is saved in the messages table with:

* direction: inbound
* sender_type: patient
* content: patient message
* raw_payload: WhatsApp webhook data

---

### Step 3 — AI Classifies the Message

The backend sends the patient message and recent conversation context to the AI engine.

The AI must return structured JSON.

Expected AI classification output:

{
"intent": "appointment_request",
"confidence": 0.92,
"requires_handoff": false,
"patient_message_summary": "Patient wants an implant appointment.",
"extracted_data": {
"treatment_interest": "implant",
"preferred_day": null,
"preferred_time": null,
"patient_name": null
},
"reply": "Elbette, implant muayenesi için uygun randevu saatlerini kontrol ediyorum."
}

The backend must not trust free-text replies alone.

The backend should use the structured fields to decide the next action.

---

### Step 4 — Backend Decides Next Action

The backend decides what to do based on AI intent.

Possible backend actions:

* answer_general_question
* ask_clarifying_question
* check_calendar_availability
* create_appointment
* handoff_to_human
* close_conversation

For appointment_request intent, the backend should check calendar availability.

---

### Step 5 — Calendar Availability Check

The backend checks doctor availability from Google Calendar.

For MVP, the system may use one demo doctor and one Google Calendar.

The backend should return 2 or 3 available time slots.

Example:

* Tomorrow 14:00
* Tomorrow 16:30
* Wednesday 11:00

The system must not offer already booked time slots.

The system must not create an appointment before the patient confirms a specific time.

---

### Step 6 — AI Sends Available Options

The AI replies to the patient with available time slots.

Example:

“İmplant muayenesi için uygun saatleri kontrol ettim. Yarın 14:00, yarın 16:30 veya Çarşamba 11:00 uygun görünüyor. Hangisi sizin için uygundur?”

The outgoing message is saved in the messages table with:

* direction: outbound
* sender_type: ai
* content: AI reply

---

### Step 7 — Patient Selects a Time

The patient replies with a selected time.

Example:

“Yarın 16:30 uygun.”

The backend sends this message to the AI engine again.

The AI extracts the selected appointment time.

Expected AI output:

{
"intent": "appointment_time_selected",
"confidence": 0.91,
"requires_handoff": false,
"extracted_data": {
"selected_time": "tomorrow 16:30"
},
"reply": "Randevunuzu oluşturuyorum."
}

---

### Step 8 — Appointment Is Created

The backend creates the appointment in Google Calendar.

The backend also creates an appointment record in the database.

The appointment should include:

* clinic_id
* doctor_id
* patient_id
* conversation_id
* treatment_interest
* start_time
* end_time
* status: confirmed
* google_calendar_event_id
* created_by: ai

---

### Step 9 — Patient Receives Confirmation

After the appointment is created, the patient receives a confirmation message.

Example:

“Randevunuz yarın saat 16:30 için oluşturuldu. Klinik adresimiz: [adres]. Randevu saatinden önce klinikte olmanız yeterlidir. Görüşmek üzere.”

The confirmation message is saved in the messages table.

---

### Step 10 — Clinic Staff Can View Appointment

Clinic staff should be able to see the appointment in the dashboard.

For MVP, the dashboard only needs to show:

* Patient name or phone
* Treatment interest
* Appointment date and time
* Doctor
* Conversation status
* Appointment status

The dashboard does not need advanced analytics in MVP.

---

## 42. Secondary Workflow: Price Question

If the patient asks for price:

Example:

“İmplant fiyatı ne kadar?”

The AI should not give exact price unless clinic-approved pricing exists.

Preferred reply:

“İmplant fiyatları hastanın durumuna ve uygulanacak işleme göre değişebilir. Net bilgi için muayene gereklidir. Dilerseniz sizin için uygun bir muayene randevusu oluşturabilirim.”

The goal is to answer safely and guide toward appointment creation.

---

## 43. Secondary Workflow: Location Question

If the patient asks for location:

Example:

“Konum atar mısınız?”

The AI may provide clinic-approved address and map link.

Example reply:

“Elbette. Klinik adresimiz: [clinic_address]. Harita bağlantısı: [map_link]. Dilerseniz randevu uygunluğunu da kontrol edebilirim.”

---

## 44. Secondary Workflow: Human Handoff

If the patient requests a human or the AI detects risk, the system should create a handoff.

Example patient message:

“Biriyle görüşmek istiyorum.”

Example AI reply:

“Elbette. Görüşmeyi klinik ekibimize aktarıyorum. En kısa sürede sizinle iletişime geçilecektir.”

The backend should:

* Update conversation status to handed_off_to_human
* Create a handoff record
* Notify clinic staff if notification system exists
* Stop autonomous AI replies for that conversation until staff resolves it

---

## 45. Secondary Workflow: Emergency or Severe Pain

If the patient mentions severe pain, swelling, bleeding, trauma, fever, or urgent symptoms, AI must not continue normal automation.

Example patient message:

“Dişim çok şişti, çok ağrım var.”

Example AI reply:

“Geçmiş olsun. Anlattığınız durum acil değerlendirme gerektirebilir. Sizi klinik ekibimize yönlendiriyorum. En kısa sürede sizinle iletişime geçilecektir. Acil bir durum olduğunu düşünüyorsanız lütfen en yakın sağlık kuruluşuna başvurun.”

The backend must create a handoff record.

---

## 46. Backend Action Types

The backend should support these action types:

* classify_message
* generate_reply
* check_availability
* create_appointment
* create_patient
* update_patient
* save_message
* create_handoff
* update_conversation_status

These actions should be small and testable.

---

## 47. MVP API Endpoints v0.1

The initial backend may include the following API endpoints:

### POST /api/whatsapp/webhook

Purpose:

Receive incoming WhatsApp webhook events.

Responsibilities:

* Verify webhook request
* Parse incoming message
* Save message
* Trigger AI processing
* Send response

---

### POST /api/ai/classify

Purpose:

Classify patient message and return structured AI output.

Responsibilities:

* Receive message and conversation context
* Call AI provider
* Return structured JSON

---

### GET /api/appointments

Purpose:

List appointments for clinic dashboard.

Responsibilities:

* Fetch appointments from database
* Filter by clinic
* Sort by appointment date

---

### POST /api/appointments

Purpose:

Create appointment manually or through AI workflow.

Responsibilities:

* Validate patient, clinic, doctor, and time
* Check calendar availability
* Create Google Calendar event
* Save appointment in database

---

### GET /api/doctors/:doctorId/availability

Purpose:

Return available time slots for a doctor.

Responsibilities:

* Read doctor calendar configuration
* Check Google Calendar availability
* Return available slots

---

## 48. MVP Dashboard Screens

The MVP dashboard only needs clinic staff operations screens.

The dashboard is not the primary patient booking surface and is not used by patients.

### 1. Login Screen

Simple login for clinic staff.

### 2. Doctor View

Shows today’s appointments, weekly appointments, patient notes, treatment interest, AI conversation summary, and appointment status.

### 3. Secretary View

Shows today’s operations, phone-call appointment entry, manual appointment editing, appointment cancellation, handoff queue, doctor availability view, and Google Calendar sync status.

### 4. Admin / Owner View

Shows appointment volume, AI-generated appointments, phone-call appointments, handoff rate, doctor occupancy, and conversion indicators.

### 5. Conversations Screen

Shows patient conversations from the messaging channel, AI conversation summaries, and handoff state.

### 6. Secretary Manual Appointment Desk

Allows secretaries to create phone-call appointments manually and sync them to Google Calendar.

### 7. Clinic Settings Screen

Stores clinic name, address, WhatsApp number, and working hours.

### 8. Doctors Screen

Stores doctor names and connected calendar IDs.

### 9. Knowledge Base Screen

Allows clinic-approved answers to be added or edited.

### 10. Admin Demo Tools Screen

Allows local demo/admin actions such as mock appointment demos and optional demo calendar event creation.

The dashboard should be simple.

It should not look like a hospital ERP.

It should not become a patient-facing booking interface.

---

## 49. MVP Development Priority

Development must follow this order:

1. Project setup
2. Database schema
3. Mock clinic and doctor data
4. AI classification without WhatsApp
5. Calendar availability check
6. Appointment creation
7. Simple dashboard
8. WhatsApp webhook connection
9. End-to-end test
10. Pilot demo

WhatsApp should be connected after the core logic works with test messages.

This prevents wasting time on WhatsApp setup before the product logic is ready.

---

## 50. Workflow Design Principle

The system must be built as a set of small, understandable workflows.

Each workflow should be testable without the full product.

The first test should not require a real clinic.

The first test should use:

* One demo clinic
* One demo doctor
* One connected calendar
* One test patient message
* One successful appointment creation
---

## 51. AI Coding Assistant Rules v0.1

This project will be developed with AI coding assistants such as Codex, ChatGPT, or Claude Code.

The AI coding assistant must behave like a junior software developer working under a strict product and technical plan.

The assistant must not invent product scope.

The assistant must not add features outside the MVP without approval.

The assistant must follow this Master Blueprint.

---

## 52. General Development Rules

The AI coding assistant must follow these rules:

1. Always read `MASTER_BLUEPRINT.md` before making major changes.
2. Do not create unnecessary files.
3. Do not add features outside MVP scope.
4. Do not introduce complex architecture unless required.
5. Prefer simple and readable code.
6. Keep functions small and testable.
7. Explain every major change before applying it.
8. Never store API keys directly in code.
9. Use environment variables for secrets.
10. Update documentation when architecture changes.

---

## 53. Forbidden Development Behavior

The AI coding assistant must not:

* Build a full hospital management system
* Add payment systems in MVP
* Add Instagram automation in MVP
* Add voice AI in MVP
* Add phone call handling in MVP
* Add mobile applications in MVP
* Add complex analytics in MVP
* Add unnecessary UI animations
* Rewrite the whole project without permission
* Replace the chosen technology stack without permission

---

## 54. Development Style

The project should be developed in small steps.

Each step should produce a clear output.

Preferred development style:

1. Plan
2. Implement
3. Test
4. Document
5. Commit

The AI coding assistant should never make large uncontrolled changes.

---

## 55. Code Quality Rules

Code should be:

* Simple
* Readable
* Modular
* Easy to debug
* Easy to extend
* Safe with user data
* Consistent in naming

The first version does not need perfect architecture.

The first version needs reliable core workflow.

---

## 56. Environment Variables

The project must use environment variables for secrets.

Possible environment variables:

* OPENAI_API_KEY
* SUPABASE_URL
* SUPABASE_ANON_KEY
* SUPABASE_SERVICE_ROLE_KEY
* GOOGLE_CLIENT_ID
* GOOGLE_CLIENT_SECRET
* GOOGLE_CALENDAR_ID
* WHATSAPP_ACCESS_TOKEN
* WHATSAPP_PHONE_NUMBER_ID
* WHATSAPP_VERIFY_TOKEN

These values must never be committed to GitHub.

---

## 57. Local Development Principle

The first version should be testable locally before connecting real WhatsApp.

The developer should be able to test the core workflow with a fake patient message.

Example local test message:

“Merhaba, implant için randevu almak istiyorum.”

The system should process this message and return the next action.

---

## 58. First Local Test Goal

Before WhatsApp integration, the system must pass this local test:

Input:

“Merhaba, implant için randevu almak istiyorum.”

Expected result:

1. Patient intent is classified as appointment_request.
2. Treatment interest is extracted as implant.
3. System checks available demo doctor slots.
4. System returns 2 or 3 available appointment options.
5. No appointment is created until patient selects a time.

---

## 59. First Agent End-to-End Demo Goal

The first full demo should show this flow:

1. Patient sends appointment request.
2. Oravia understands the message.
3. Oravia offers available times.
4. Patient selects a time.
5. Oravia creates appointment.
6. Clinic/admin dashboard shows the agent-created appointment for monitoring.

The demo may use a test WhatsApp number, a simulated messaging channel, and demo clinic data.

The patient should not use the dashboard to book.

---

## 60. Development Priority Rule

The project must always prioritize the shortest path to a sellable demo.

The sellable demo is:

A dental clinic owner can see that the Oravia agent receives a patient message through a messaging-style flow, responds safely, checks availability, creates an appointment, and shows the result in the admin dashboard.

Anything that does not support this demo should be postponed.
---

## 61. Execution Plan v0.1

Oravia will be developed as a part-time founder project.

The founder works full-time during weekdays, so the project must be planned around limited weekly availability.

The project must not depend on long daily coding sessions.

The execution system must be simple, repeatable, and sustainable.

---

## 62. Weekly Time Budget

Target weekly project time:

8 to 10 hours per week.

Suggested schedule:

Weekdays:

* 45 to 60 minutes per day
* Focus on planning, reviewing, testing, and giving tasks to AI coding assistant

Saturday:

* 4 to 5 hours
* Main building session

Sunday:

* 2 to 3 hours
* Testing, documentation, and next sprint planning

The project should not require more than 10 hours per week in the early stage.

Consistency is more important than intensity.

---

## 63. Founder Role

The founder should not act as a full-time software developer.

The founder should act as:

* Product owner
* Tester
* Customer researcher
* Sales lead
* Decision maker

The AI coding assistant should act as:

* Junior developer
* Code implementer
* Documentation assistant
* Debugging assistant

The founder must avoid getting trapped in technical perfection.

The main founder responsibility is moving the product toward the first paying clinic.

---

## 64. Sprint System

Each sprint must have:

1. One clear goal
2. Maximum 5 core tasks
3. One visible output
4. One GitHub commit
5. One short progress note

No sprint should include too many goals.

Bad sprint goal:

“Build the whole clinic AI platform.”

Good sprint goal:

“Build local AI classification test for appointment requests.”

---

## 65. Sprint 0 — Product Foundation

Goal:

Create the product foundation and working documentation.

Outputs:

* MASTER_BLUEPRINT.md
* Clear MVP scope
* Technical architecture
* Database plan
* AI behavior rules
* Workflow plan
* AI coding assistant rules

Success condition:

The founder and AI coding assistant both understand what Oravia is, what it will build, and what it will not build.

Status:

In progress.

---

## 66. Sprint 1 — Clean Project Setup

Goal:

Create a clean GitHub repository and basic project structure.

Tasks:

1. Create clean repository named `oravia`.
2. Add `MASTER_BLUEPRINT.md`.
3. Add `.gitignore`.
4. Add `README.md`.
5. Create basic folder structure.

Recommended folder structure:

oravia/
docs/
app/
database/
prompts/
scripts/
assets/

Success condition:

A clean repository exists and can be opened in VS Code without confusion.

No application code is required in this sprint.

---

## 67. Sprint 2 — Local AI Intent Classifier

Goal:

Build the first local test for AI message classification.

Tasks:

1. Set up basic Next.js or Node.js project.
2. Add environment variable support.
3. Create AI classification function.
4. Test with sample patient message.
5. Return structured JSON.

Test input:

“Merhaba, implant için randevu almak istiyorum.”

Expected output:

* intent: appointment_request
* treatment_interest: implant
* requires_handoff: false
* reply: short appointment-focused response

Success condition:

The system can classify one test patient message without WhatsApp integration.

---

## 68. Sprint 3 — Demo Data and Appointment Logic

Goal:

Create fake clinic, doctor, and available appointment slots.

Tasks:

1. Create demo clinic data.
2. Create demo doctor data.
3. Create available time slot function.
4. Return 2 or 3 appointment options.
5. Prevent appointment creation before patient confirms.

Success condition:

The system can offer available appointment times after detecting an appointment request.

---

## 69. Sprint 4 — Appointment Creation

Goal:

Create a basic appointment after patient selects a time.

Tasks:

1. Detect selected time from patient reply.
2. Create appointment record.
3. Store patient information.
4. Store conversation state.
5. Return appointment confirmation message.

Success condition:

A fake patient can request an appointment, select a time, and receive confirmation.

Google Calendar may still be mocked at this stage.

---

## 70. Sprint 5 — Google Calendar Integration

Goal:

Connect appointment creation to Google Calendar.

Tasks:

1. Connect Google Calendar API.
2. Check real availability.
3. Create real calendar event.
4. Store Google Calendar event ID.
5. Test appointment creation with demo calendar.

Success condition:

An appointment created by Oravia appears in Google Calendar.

---

## 71. Sprint 6 — Simple Clinic Dashboard

Goal:

Create a basic dashboard for clinic staff.

Screens:

1. Appointments
2. Conversations
3. Doctors
4. Clinic Settings
5. Knowledge Base

Success condition:

Clinic staff can see created appointments and basic patient conversation data.

The dashboard should be simple and functional.

---

## 72. Sprint 7 — WhatsApp Integration

Goal:

Connect the system to WhatsApp Business Cloud API.

Tasks:

1. Create WhatsApp webhook endpoint.
2. Verify webhook.
3. Receive incoming WhatsApp message.
4. Send outgoing WhatsApp reply.
5. Test full message flow.

Success condition:

A patient can send a WhatsApp message and receive an Oravia response.

---

## 73. Sprint 8 — Sellable Demo

Goal:

Prepare the first clinic demo.

Demo flow:

1. Patient sends WhatsApp message.
2. Oravia understands the intent.
3. Oravia offers appointment options.
4. Patient selects time.
5. Oravia creates appointment.
6. Clinic dashboard shows appointment.

Success condition:

The founder can show the product to a real dental clinic owner or manager.

---

## 74. Sales Validation Parallel Track

Development must not happen in isolation.

While building the MVP, the founder should research dental clinics.

Minimum validation target:

20 dental clinics.

For each clinic, collect:

* Clinic name
* City/district
* WhatsApp usage
* Instagram activity
* Online appointment availability
* Number of doctors if visible
* Main communication style
* Possible automation opportunity

The goal is not to sell immediately.

The goal is to understand whether clinics actually need this system.

---

## 75. First Sales Message Hypothesis

The initial sales positioning:

“Merhaba, diş klinikleri için WhatsApp üzerinden çalışan yapay zekâ destekli dijital sekreter sistemi geliştiriyoruz. Sistem; hasta mesajlarını yanıtlıyor, uygun doktor saatlerini kontrol ediyor ve otomatik randevu oluşturuyor. Kliniğinizde WhatsApp mesajları ve randevu takibi zaman alıyor mu?”

This message is not final.

It will be tested and improved after real clinic feedback.

---

## 76. Execution Principle

Oravia must be built in the following order:

1. Clear product
2. Clean repository
3. Local logic
4. Calendar integration
5. Dashboard
6. WhatsApp integration
7. Demo
8. Sales

The project must not start with WhatsApp integration.

The project must not start with logo or website.

The project must not start with advanced dashboard design.

The project starts with the smallest working appointment automation flow.

---

## 77. Final MVP Rule

The MVP is complete only when this sentence is true:

“A dental clinic owner can watch the Oravia agent receive a patient message, understand it, offer available times in a messaging-style flow, create an appointment, and show the result in the clinic/admin dashboard.”

Until this works, every other feature is secondary.
