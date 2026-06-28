const demoClinic = {
  id: "clinic_demo_oravia",
  name: "Oravia Demo Dental Clinic",
  timezone: "Europe/Istanbul",
  address: "Demo address"
};

const demoDoctor = {
  id: "doctor_demo_dentist",
  clinic_id: demoClinic.id,
  name: "Dr. Demo Dentist",
  specialty: "General Dentistry",
  appointment_duration_minutes: 30
};

module.exports = {
  demoClinic,
  demoDoctor
};
